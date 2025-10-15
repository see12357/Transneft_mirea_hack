import os
import redis
import json
import requests
import time
from fastapi import FastAPI, HTTPException, Request
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
OLLAMA_MODEL_NAME = "gemma3:1b-it-qat"
EMBEDDING_MODEL_NAME = "Qwen/Qwen3-Embedding-0.6B"
MODEL_CACHE_PATH = "/root/.cache/huggingface"
OLLAMA_BASE_URL = "http://ollama:11434"

# --- КЛИЕНТ REDIS ---
redis_client = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True)


def ensure_ollama_model(model_name: str, base_url: str):
    """Проверяет наличие модели в Ollama и запускает ее скачивание, если необходимо."""
    print(f"Проверка наличия модели '{model_name}' в Ollama...")
    try:
        # Отправляем запрос на скачивание. stream=False означает, что запрос будет ждать
        # завершения скачивания и вернет итоговый статус.
        response = requests.post(f"{base_url}/api/pull", json={"name": model_name, "stream": False}, timeout=3600) # Таймаут 1 час
        response.raise_for_status()

        # Иногда Ollama возвращает 200, но с ошибкой в теле ответа
        if "error" in response.json():
            raise Exception(response.json()['error'])

        print(f"Модель '{model_name}' успешно загружена или уже была доступна.")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Сетевая ошибка при попытке связаться с Ollama: {e}")
        return False
    except Exception as e:
        print(f"❌ Не удалось скачать модель '{model_name}': {e}")
        return False


# --- LIFESPAN MANAGER ДЛЯ ЗАГРУЗКИ МОДЕЛЕЙ ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Сервер запускается... Подготовка зависимостей...")

    # Шаг 1: Убедимся, что модель Ollama доступна
    ollama_ready = False
    max_retries = 20
    retry_delay = 15  # секунд

    for i in range(max_retries):
        if ensure_ollama_model(OLLAMA_MODEL_NAME, OLLAMA_BASE_URL):
            ollama_ready = True
            break
        print(f"Попытка {i+1}/{max_retries}. Ollama еще не готова, ждем {retry_delay} секунд...")
        time.sleep(retry_delay)

    if not ollama_ready:
        raise RuntimeError("Не удалось подготовить модель в Ollama после нескольких попыток. Сервер не может запуститься.")

    # Шаг 2: Загрузка локальных моделей и данных
    print(f"Загрузка embedding-модели '{EMBEDDING_MODEL_NAME}' из локального кеша...")
    embedding_model = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs={'device': 'cpu'},
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

    # Шаг 3: Инициализация RAG-цепочки
    try:
        print("Инициализация RAG-цепочки с моделью Ollama...")
        llm = ChatOllama(
            model=OLLAMA_MODEL_NAME,
            temperature=0.1,
            base_url=OLLAMA_BASE_URL
        )
        template = """Ты — дружелюбный и компетентный виртуальный помощник компании "Транснефть". Твоя главная цель — помогать пользователям, предоставляя понятные и точные ответы на основе внутренней базы знаний.

СТИЛЬ ОБЩЕНИЯ:
- Всегда начинай ответ с вежливого и дружелюбного приветствия (например, "Здравствуйте!", "Добрый день!").
- Говори простым и ясным языком. Избегай излишне формального или роботизированного тона.
- Будь позитивным и готовым помочь.

ИНСТРУКЦИИ ПО РАБОТЕ С ИНФОРМАЦИЕЙ:
1.  Внимательно изучи предоставленный КОНТЕКСТ. Твои ответы должны основываться **строго** на этой информации.
2.  Не используй свои общие знания извне. Если в контексте чего-то нет, значит, ты этого не знаешь.
3.  Структурируй сложные ответы, используя списки или абзацы для лучшего восприятия.
4.  **Если в контексте нет ответа на вопрос**, вежливо сообщи об этом. Используй одну из фраз: "К сожалению, я не нашел информации по вашему вопросу в документах. Могу ли я помочь чем-то еще?" или "Простите, в моей базе знаний нет данных на этот счет. Пожалуйста, попробуйте переформулировать вопрос."
5.  Завершай ответ позитивной фразой, например: "Надеюсь, это помогло!", "Если у вас есть еще вопросы, я готов помочь!" или "Рад был помочь!".

КОНТЕКСТ:
{context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ:
{question}

ТВОЙ ДРУЖЕЛЮБНЫЙ ОТВЕТ:"""
        prompt = ChatPromptTemplate.from_template(template)
        def format_docs(docs): return "\n\n".join(doc.page_content for doc in docs)
        app.state.rag_chain = ({"context": retriever | format_docs, "question": RunnablePassthrough()} | prompt | llm | StrOutputParser())
        print("✅ RAG-цепочка успешно создана.")

    except Exception as e:
        print(f"❌ ОШИБКА при создании RAG-цепочки: {e}")
        raise RuntimeError("Could not create RAG chain") from e

    print("✅ Все модели и RAG-цепочка успешно загружены. Сервер готов к работе.")
    yield
    print("Сервер останавливается.")


# --- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ---
app = FastAPI(title="Transneft AI Assistant API", lifespan=lifespan)
origins = ["http://localhost", "http://localhost:3000", "http://localhost:5173", "http://localhost:80"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
class ChatRequest(BaseModel):
    question: str
    session_id: str
@app.get("/api/chat/history/{session_id}", summary="Получить историю чата")
async def get_chat_history(session_id: str):
    history_json = redis_client.get(session_id)
    if history_json:
        return json.loads(history_json)
    return []


# --- API ЭНДПОИНТЫ ---
@app.post("/api/chat", summary="Получить ответ от ассистента")
async def get_answer(chat_data: ChatRequest, request: Request):
    print("\n" + "=" * 50)
    print(f"ПОЛУЧЕН ЗАПРОС: /api/chat")
    print(f"ID сессии: {chat_data.session_id}")
    print(f"Вопрос: {chat_data.question}")

    rag_chain = request.app.state.rag_chain
    if not rag_chain:
        raise HTTPException(status_code=503, detail="Сервер еще инициализируется.")

    try:
        print("Вызов RAG-цепочки...")
        response_text = rag_chain.invoke(chat_data.question)
        print(f"ПОЛУЧЕН ОТВЕТ от LLM: {response_text}")
        print("=" * 50 + "\n")

        history_json = redis_client.get(chat_data.session_id)
        chat_history = json.loads(history_json) if history_json else []

        chat_history.append({"sender": "user", "text": chat_data.question})
        chat_history.append({"sender": "bot", "text": response_text})

        redis_client.set(chat_data.session_id, json.dumps(chat_history), ex=3600)

        return {"answer": response_text}

    except Exception as e:
        print(f"❌ ОШИБКА при обработке запроса: {e}")
        raise HTTPException(status_code=500, detail=f"Произошла внутренняя ошибка: {e}")