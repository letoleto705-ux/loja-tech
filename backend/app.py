import os
import unicodedata
from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
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
    descricao = db.Column(db.Text, nullable=False, default="")
    preco = db.Column(db.Float, nullable=False, default=0)
    custo = db.Column(db.Float, nullable=False, default=0)
    categoria = db.Column(db.String(120), nullable=False, default="")
    imagem = db.Column(db.String(1000), nullable=False, default="")
    tipo = db.Column(db.String(20), nullable=False, default="cj")

    def to_dict(self):
        return {
            "id": self.id,
            "pid": self.pid,
            "nome": self.nome,
            "descricao": self.descricao,
            "preco": self.preco,
            "categoria": self.categoria,
            "imagem": self.imagem,
            "tipo": self.tipo
        }

# Credenciais da CJ lidas direto do .env
CJ_API_KEY = os.getenv("CJ_TOKEN")
CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1"
_tabela_produtos_preparada = False

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

def listar_produtos_cj(access_token, limite=1000):
    headers = {
        "CJ-Access-Token": access_token,
        "Content-Type": "application/json"
    }
    produtos = []
    pagina_tamanho = 100
    for pagina in range(1, (min(max(limite, 1), 1000) + pagina_tamanho - 1) // pagina_tamanho + 1):
        resposta = requests.get(
            f"{CJ_BASE_URL}/product/list",
            headers=headers,
            params={"pageNum": pagina, "pageSize": pagina_tamanho},
            timeout=20
        )
        resposta.raise_for_status()
        dados = resposta.json()
        if not dados.get("result"):
            raise RuntimeError("A API da CJ não retornou uma lista de produtos válida.")
        lista = dados.get("data", {}).get("list", [])
        if not isinstance(lista, list):
            raise RuntimeError("Formato inesperado na resposta de produtos da CJ.")
        produtos.extend(lista)
        if len(produtos) >= limite or len(lista) < pagina_tamanho:
            break
    return produtos[:limite]

def nome_ingles(item):
    nomes = (
        item.get("productNameEn"),
        item.get("productNameEnglish"),
        item.get("englishName"),
        item.get("nameEn"),
        item.get("productTitleEn"),
        item.get("productName"),
        item.get("entryName")
    )
    for valor in nomes:
        nome = str(valor or "").strip()
        letras = [caractere for caractere in nome if caractere.isalpha()]
        if letras and all(unicodedata.name(caractere, "").startswith("LATIN ") for caractere in letras):
            return nome[:255]
    return ""

def preco_cj(item):
    bruto = str(item.get("sellPrice") or item.get("productPrice") or "0").split("-")[0].strip()
    try:
        return float(bruto)
    except ValueError:
        return 0.0

def produto_publico(item):
    pid = str(item.get("pid") or "")[:100]
    nome = nome_ingles(item)
    custo = preco_cj(item)
    if not pid or not nome or custo <= 0:
        return None
    categoria = str(item.get("categoryName") or item.get("category") or "")[:120]
    imagem = str(item.get("productImage") or item.get("bigImage") or item.get("image") or "")[:1000]
    return {
        "pid": pid,
        "nome": nome,
        "descricao": item.get("description") or item.get("productDescription") or "",
        "preco": round(custo * 2, 2),
        "categoria": categoria,
        "imagem": imagem,
        "tipo": "cj"
    }

def preparar_tabela_produtos():
    global _tabela_produtos_preparada
    if _tabela_produtos_preparada:
        return
    db.create_all()
    for coluna, declaracao in {
        "descricao": "TEXT NOT NULL DEFAULT ''",
        "custo": "FLOAT NOT NULL DEFAULT 0",
        "categoria": "VARCHAR(120) NOT NULL DEFAULT ''",
        "imagem": "VARCHAR(1000) NOT NULL DEFAULT ''",
        "tipo": "VARCHAR(20) NOT NULL DEFAULT 'cj'"
    }.items():
        db.session.execute(text(f"ALTER TABLE produtos ADD COLUMN IF NOT EXISTS {coluna} {declaracao}"))
    db.session.commit()
    _tabela_produtos_preparada = True

@app.route("/")
def home():
    return jsonify({"status": "Servidor da Loja Tech rodando perfeitamente com .env!"})

# Rota para criar a tabela no Neon DB
@app.route("/api/criar-tabela", methods=["GET"])
def criar_tabela():
    try:
        with app.app_context():
            preparar_tabela_produtos()
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
    
    try:
        produtos = listar_produtos_cj(access_token)
        publicos = []
        for item in produtos:
            produto = produto_publico(item)
            if produto:
                publicos.append(produto)
        return jsonify({"result": True, "data": {"list": publicos, "total": len(publicos)}})
    except Exception as e:
        return jsonify({"erro": "Erro interno no servidor", "detalhes": str(e)}), 500

# Rota para salvar os produtos da CJ no Neon DB (Tratando intervalos de preço)
@app.route("/api/sincronizar-produtos", methods=["GET"])
def sincronizar_produtos():
    access_token = obter_access_token()
    if not access_token:
        return jsonify({"erro": "Falha na autenticação com a CJ"}), 401

    try:
        lista_itens = listar_produtos_cj(access_token)
        
        if not lista_itens:
            return jsonify({"aviso": "Nenhum produto retornado pela CJ para sincronizar."}), 400

        produtos_salvos = 0
        sem_nome_ingles = 0
        with app.app_context():
            preparar_tabela_produtos()
            for item in lista_itens:
                pid = str(item.get("pid") or "")[:100]
                nome = nome_ingles(item)
                custo = preco_cj(item)

                if not nome:
                    sem_nome_ingles += 1
                    continue
                if pid and custo > 0:
                    produto_existente = Produto.query.filter_by(pid=pid).first()
                    categoria = str(item.get("categoryName") or item.get("category") or "")[:120]
                    imagem = str(item.get("productImage") or item.get("bigImage") or item.get("image") or "")[:1000]
                    descricao = item.get("description") or item.get("productDescription") or ""
                    
                    if not produto_existente:
                        novo_produto = Produto(
                            pid=pid,
                            nome=nome,
                            descricao=descricao,
                            preco=round(custo * 2, 2),
                            custo=custo,
                            categoria=categoria,
                            imagem=imagem,
                            tipo="cj"
                        )
                        db.session.add(novo_produto)
                        produtos_salvos += 1
                    else:
                        produto_existente.nome = nome
                        produto_existente.custo = custo
                        produto_existente.preco = round(custo * 2, 2)
                        produto_existente.categoria = categoria
                        produto_existente.imagem = imagem
                        produto_existente.descricao = descricao
                        produto_existente.tipo = "cj"

            db.session.commit()

        return jsonify({
            "sucesso": True,
            "lidos": len(lista_itens),
            "sem_nome_ingles": sem_nome_ingles,
            "mensagem": f"Sincronização concluída. {produtos_salvos} novos produtos salvos no Neon DB."
        })

    except Exception as e:
        return jsonify({"erro": "Erro ao sincronizar produtos", "detalhes": str(e)}), 500

# --- NOVA ROTA: LISTA OS PRODUTOS SALVOS NO NEON DB ---
@app.route("/api/produtos-salvos", methods=["GET"])
def listar_produtos_salvos():
    try:
        with app.app_context():
            preparar_tabela_produtos()
            produtos = Produto.query.all()
            return jsonify([p.to_dict() for p in produtos])
    except Exception as e:
        return jsonify({"erro": "Erro ao buscar produtos salvos", "detalhes": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)