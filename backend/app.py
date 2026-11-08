import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import requests
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env primeiro
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuração do Banco de Dados Neon DB (Lendo do .env)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- MODELO DA TABELA DE PRODUTOS ---
class Produto(db.Model):
    __tablename__ = 'produtos'
    
    id = db.Column(db.Integer, primary_key=True)
    pid = db.Column(db.String(100), unique=True, nullable=False)
    nome = db.Column(db.String(255), nullable=False)
    preco = db.Column(db.Float, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "pid": self.pid,
            "nome": self.nome,
            "preco": self.preco
        }

# Credenciais da CJ lidas direto do .env
CJ_API_KEY = os.getenv("CJ_TOKEN")
CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1"

def obter_access_token():
    url = f"{CJ_BASE_URL}/authentication/getAccessToken"
    payload = {"apiKey": CJ_API_KEY}
    headers = {"Content-Type": "application/json"}
    
    try:
        resposta = requests.post(url, json=payload, timeout=10)
        dados = resposta.json()
        if dados.get("result") and dados.get("data"):
            return dados["data"]["accessToken"]
        return None
    except Exception:
        return None

@app.route("/")
def home():
    return jsonify({"status": "Servidor da Loja Tech rodando perfeitamente com .env!"})

# Rota para criar a tabela no Neon DB
@app.route("/api/criar-tabela", methods=["GET"])
def criar_tabela():
    try:
        with app.app_context():
            db.create_all()
        return jsonify({"sucesso": True, "mensagem": "Tabela 'produtos' criada com sucesso no Neon DB!"})
    except Exception as e:
        return jsonify({"sucesso": False, "erro": str(e)}), 500

# Rota para buscar produtos direto da CJ
@app.route("/api/produtos", methods=["GET"])
def buscar_produtos():
    access_token = obter_access_token()
    
    if not access_token:
        return jsonify({
            "erro": "Falha na autenticação com a CJ",
            "detalhes": "Não foi possível obter o accessToken com a API Key fornecida."
        }), 401
    
    headers = {
        "CJ-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    
    params = {
        "pageNum": 1,
        "pageSize": 10
    }
    
    try:
        resposta = requests.get(
            f"{CJ_BASE_URL}/product/list",
            headers=headers,
            params=params,
            timeout=10
        )
        return jsonify(resposta.json()), resposta.status_code
    except Exception as e:
        return jsonify({"erro": "Erro interno no servidor", "detalhes": str(e)}), 500

# Rota para salvar os produtos da CJ no Neon DB (Tratando intervalos de preço)
@app.route("/api/sincronizar-produtos", methods=["GET"])
def sincronizar_produtos():
    access_token = obter_access_token()
    if not access_token:
        return jsonify({"erro": "Falha na autenticação com a CJ"}), 401

    headers = {
        "CJ-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    params = {"pageNum": 1, "pageSize": 10}

    try:
        resposta = requests.get(f"{CJ_BASE_URL}/product/list", headers=headers, params=params, timeout=10)
        dados = resposta.json()

        lista_itens = dados.get("data", {}).get("list", [])
        
        if not lista_itens:
            return jsonify({"aviso": "Nenhum produto retornado pela CJ para sincronizar."}), 400

        produtos_salvos = 0
        with app.app_context():
            for item in lista_itens:
                pid = item.get("pid")
                nome = item.get("productName") or item.get("entryName") or "Produto sem nome"
                
                # Trata o preço bruto (se vier como "8.51 - 22.79", pega o primeiro valor)
                preco_bruto = str(item.get("sellPrice") or item.get("productPrice") or "0.0")
                if "-" in preco_bruto:
                    preco_bruto = preco_bruto.split("-")[0].strip()
                
                try:
                    preco = float(preco_bruto)
                except ValueError:
                    preco = 0.0

                if pid:
                    produto_existente = Produto.query.filter_by(pid=pid).first()
                    
                    if not produto_existente:
                        novo_produto = Produto(pid=pid, nome=nome, preco=preco)
                        db.session.add(novo_produto)
                        produtos_salvos += 1

            db.session.commit()

        return jsonify({
            "sucesso": True,
            "mensagem": f"Sincronização concluída com sucesso! {produtos_salvos} novos produtos salvos no Neon DB."
        })

    except Exception as e:
        return jsonify({"erro": "Erro ao sincronizar produtos", "detalhes": str(e)}), 500

# --- NOVA ROTA: LISTA OS PRODUTOS SALVOS NO NEON DB ---
@app.route("/api/produtos-salvos", methods=["GET"])
def listar_produtos_salvos():
    try:
        with app.app_context():
            produtos = Produto.query.all()
            return jsonify([p.to_dict() for p in produtos])
    except Exception as e:
        return jsonify({"erro": "Erro ao buscar produtos salvos", "detalhes": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)