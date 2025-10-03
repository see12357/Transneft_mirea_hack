from fastapi import FastAPI
from pydantic import BaseModel
# Импортируем наш "адаптер"
from langchain_community.embeddings import HuggingFaceEmbeddings # <-- ИЗМЕНЕНИЕ 1
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
# 'sentence-transformers' больше не нужен здесь
# from sentence_transformers import SentenceTransformer

# --- НАСТРОЙКИ ---
FAISS_INDEX_PATH = "data/faiss_index_gemma"
OLLAMA_MODEL_NAME = "gemma3:4b-it-qat"
EMBEDDING_MODEL_NAME = "google/embeddinggemma-300m" # Вынесем имя модели в константу

app = FastAPI(title="Transneft AI Assistant API")

# Глобальная переменная для хранения RAG-цепочки
rag_chain = None

@app.on_event("startup")
def load_models_on_startup():
    """Загружает все модели и создает RAG-цепочку при старте сервера."""
    global rag_chain

    print("Сервер запускается... Загрузка моделей...")

    # 1. Загрузка эмбеддингов и готовой векторной базы через адаптер LangChain
    embedding_model = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs={'device': 'cpu'}
    ) # <-- ИЗМЕНЕНИЕ 2

    vector_store = FAISS.load_local(
        FAISS_INDEX_PATH,
        embeddings=embedding_model,
        allow_dangerous_deserialization=True
    )
    retriever = vector_store.as_retriever(search_kwargs={'k': 4})

    # 2. Инициализация LLM через Ollama
    llm = ChatOllama(
        model=OLLAMA_MODEL_NAME,
        temperature=0.1
    )

    # 3. Создание промпта на русском языке
    template = """Ты — цифровой ассистент-консультант компании "Транснефть". Твоя задача — давать точные и фактические ответы, основываясь ИСКЛЮЧИТЕЛЬНО на предоставленном ниже контексте. Не используй свои общие знания.

ИНСТРУКЦИИ:
1. Внимательно изучи контекст.
2. Ответь на вопрос пользователя, используя только информацию из этого контекста.
3. Если в контексте нет информации для ответа на вопрос, ответь одной фразой: "К сожалению, в предоставленных мне материалах нет информации по вашему вопросу."
4. Не выдумывай и не домысливай информацию.

КОНТЕКСТ:
{context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ:
{question}

ТОЧНЫЙ ОТВЕТ:"""
    prompt = ChatPromptTemplate.from_template(template)

    def format_docs(docs):
        return "\n\n".join(doc.page_content for doc in docs)

    # 4. Сборка RAG-цепочки
    rag_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    print("✅ Все модели и RAG-цепочка успешно загружены. Сервер готов к работе.")


class ChatRequest(BaseModel):
    question: str

@app.post("/api/chat", summary="Получить ответ от ассистента")
async def get_answer(request: ChatRequest):
    """Принимает вопрос пользователя и возвращает ответ от RAG-системы."""
    if not rag_chain:
        return {"error": "Сервер еще инициализируется. Пожалуйста, подождите."}

    response_text = rag_chain.invoke(request.question)
    return {"answer": response_text}