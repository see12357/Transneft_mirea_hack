import os
import redis
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# --- НАСТРОЙКИ ---
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
FAISS_INDEX_PATH = "data/faiss_index_gemma"
OLLAMA_MODEL_NAME = "gemma3:4b-it-qat"
EMBEDDING_MODEL_NAME = "google/embeddinggemma-300m"
# Путь к кешу моделей ВНУТРИ Docker-контейнера
MODEL_CACHE_PATH = "/root/.cache/huggingface"

# --- КЛИЕНТ REDIS ---
redis_client = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True)


# --- LIFESPAN MANAGER ДЛЯ ЗАГРУЗКИ МОДЕЛЕЙ ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Сервер запускается... Загрузка моделей...")

    # --- Загружаем RAG компоненты ---
    print(f"Загрузка embedding-модели '{EMBEDDING_MODEL_NAME}' из локального кеша...")
    embedding_model = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs={'device': 'cpu'},
        # <--- ИЗМЕНЕНИЕ: Явно указываем путь к кешу моделей внутри контейнера
        cache_folder=MODEL_CACHE_PATH
    )
    print("✅ Embedding-модель успешно загружена.")

    print(f"Загрузка векторного хранилища из '{FAISS_INDEX_PATH}'...")
    vector_store = FAISS.load_local(
        FAISS_INDEX_PATH,
        embeddings=embedding_model,
        allow_dangerous_deserialization=True
    )
    retriever = vector_store.as_retriever(search_kwargs={'k': 4})
    print("✅ Векторное хранилище успешно загружено.")

    # --- Инициализируем и ПРОВЕРЯЕМ соединение с LLM ---
    try:
        print("Подключение к Ollama...")
        llm = ChatOllama(
            model=OLLAMA_MODEL_NAME,
            temperature=0.1,
            base_url="http://host.docker.internal:11434"
        )
        # Пробный вызов, чтобы убедиться, что Ollama доступна
        llm.invoke("Connection test")
        print("✅ Успешное подключение к Ollama.")
    except Exception as e:
        print(f"❌ ОШИБКА: Не удалось подключиться к Ollama. Убедитесь, что Ollama запущена. Ошибка: {e}")
        raise RuntimeError("Could not connect to Ollama") from e

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

    # Сохраняем готовую RAG-цепочку в состояние приложения
    app.state.rag_chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
    )

    print("✅ Все модели и RAG-цепочка успешно загружены. Сервер готов к работе.")
    yield
    print("Сервер останавливается.")


# --- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ---
app = FastAPI(title="Transneft AI Assistant API", lifespan=lifespan)

# --- НАСТРОЙКА CORS ---
origins = ["http://localhost", "http://localhost:3000", "http://localhost:5173", "http://localhost:80"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


# --- МОДЕЛИ ДАННЫХ (PYDANTIC) ---
class ChatRequest(BaseModel):
    question: str
    session_id: str


# --- API ЭНДПОИНТЫ ---
@app.get("/api/chat/history/{session_id}", summary="Получить историю чата")
async def get_chat_history(session_id: str):
    history_json = redis_client.get(session_id)
    if history_json:
        return json.loads(history_json)
    return []


@app.post("/api/chat", summary="Получить ответ от ассистента")
async def get_answer(request: ChatRequest):
    print("\n" + "=" * 50)
    print(f"ПОЛУЧЕН ЗАПРОС: /api/chat")
    print(f"ID сессии: {request.session_id}")
    print(f"Вопрос: {request.question}")

    rag_chain = request.app.state.rag_chain
    if not rag_chain:
        raise HTTPException(status_code=503, detail="Сервер еще инициализируется.")

    try:
        # --- ГЛАВНЫЙ ВЫЗОВ RAG-ЦЕПОЧКИ ---
        print("Вызов RAG-цепочки...")
        response_text = rag_chain.invoke(request.question)
        print(f"ПОЛУЧЕН ОТВЕТ от LLM: {response_text}")
        print("=" * 50 + "\n")
        # --- КОНЕЦ ГЛАВНОГО ВЫЗОВА ---

        history_json = redis_client.get(request.session_id)
        chat_history = json.loads(history_json) if history_json else []

        chat_history.append({"sender": "user", "text": request.question})
        chat_history.append({"sender": "bot", "text": response_text})

        redis_client.set(request.session_id, json.dumps(chat_history), ex=3600)

        return {"answer": response_text}

    except Exception as e:
        print(f"❌ ОШИБКА при обработке запроса: {e}")
        raise HTTPException(status_code=500, detail=f"Произошла внутренняя ошибка: {e}")