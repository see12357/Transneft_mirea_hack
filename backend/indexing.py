import docx
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings # <-- ИЗМЕНЕНИЕ 1

# --- НАСТРОЙКИ ---
DOCX_FILE_PATH = "data/Реестр данных о компании ПАО Транснефть для хакатона весна-лета 2026.docx"
FAISS_INDEX_PATH = "data/faiss_index_gemma"

# 1. Загрузка и очистка документа
print(f"Загрузка документа из {DOCX_FILE_PATH}...")
try:
    doc = docx.Document(DOCX_FILE_PATH)
    full_text = "\n\n".join([para.text for para in doc.paragraphs if para.text.strip()])
    print("Документ успешно загружен.")
except Exception as e:
    print(f"Ошибка при загрузке документа: {e}")
    exit()

# 2. Разделение текста на чанки
print("Разделение текста на чанки...")
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1024,
    chunk_overlap=300,
    length_function=len,
)
chunks = text_splitter.split_text(full_text)
print(f"Документ разделен на {len(chunks)} чанков.")

# 3. Инициализация модели эмбеддингов через адаптер LangChain
print("Загрузка модели эмбеддингов 'Qwen/Qwen3-Embedding-0.6B' через LangChain...")

model_name = "Qwen/Qwen3-Embedding-0.6B"
model_kwargs = {'device': 'cpu'}
embedding_model = HuggingFaceEmbeddings(
    model_name=model_name,
    model_kwargs=model_kwargs
)
print("Модель эмбеддингов загружена.")

# 4. Создание и сохранение FAISS индекса
print("Создание векторного индекса FAISS...")

vector_store = FAISS.from_texts(chunks, embedding_model)
vector_store.save_local(FAISS_INDEX_PATH)
print(f"Индекс FAISS успешно создан и сохранен в папке '{FAISS_INDEX_PATH}'.")