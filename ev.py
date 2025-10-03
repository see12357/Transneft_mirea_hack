import pandas as pd
import evaluate
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# --- НАСТРОЙКИ ---
BENCHMARK_FILE_PATH = "benchmark.csv"
FAISS_INDEX_PATH = "data/faiss_index_gemma"
OLLAMA_MODEL_NAME = "gemma3:4b-it-qat"
EMBEDDING_MODEL_NAME = "google/embeddinggemma-300m"
BGE_MODEL_NAME = "BAAI/bge-m3" # Модель для метрики SemanticAnswerSimilarity

# --- 1. ЗАГРУЗКА RAG-СИСТЕМЫ И БЕНЧМАРКА ---

print("Загрузка RAG-системы...")
# Инициализируем компоненты RAG точно так же, как в main.py
embedding_model = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL_NAME, model_kwargs={'device': 'cpu'})
vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings=embedding_model, allow_dangerous_deserialization=True)
retriever = vector_store.as_retriever(search_kwargs={'k': 10}) # Берем 10 документов для ndcg@10
llm = ChatOllama(model=OLLAMA_MODEL_NAME, temperature=0.1)

# Вставляем полный промпт из main.py
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

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
print("RAG-система загружена.")

print(f"Загрузка бенчмарка из {BENCHMARK_FILE_PATH}...")
df = pd.read_csv(BENCHMARK_FILE_PATH)
questions = df['question'].tolist()
ground_truth_answers = df['ground_truth_answer'].tolist()
ground_truth_contexts = df['ground_truth_context'].tolist()

# --- 2. ГЕНЕРАЦИЯ ОТВЕТОВ И ПОЛУЧЕНИЕ КОНТЕКСТА ---

print("Генерация ответов по бенчмарку... Это может занять некоторое время.")
generated_answers = []
retrieved_contexts_list = []
for q in questions:
    generated_answers.append(rag_chain.invoke(q))
    retrieved_docs = retriever.invoke(q)
    retrieved_contexts_list.append([doc.page_content for doc in retrieved_docs])

# --- 3. ВЫЧИСЛЕНИЕ МЕТРИК ---

print("\n--- Вычисление метрик качества генерации ---")

# ROUGE-L
rouge = evaluate.load('rouge')
rouge_results = rouge.compute(predictions=generated_answers, references=ground_truth_answers)
print(f"ROUGE-L: {rouge_results['rougeL']:.4f}")

# BLEURT с увеличенным таймаутом для скачивания
try:
    bleurt = evaluate.load(
        "bleurt",
        module_type="metric",
        checkpoint="bleurt-20",
    )
    bleurt_results = bleurt.compute(predictions=generated_answers, references=ground_truth_answers)
    print(f"BLEURT-20 (среднее): {np.mean(bleurt_results['scores']):.4f}")
except Exception as e:
    print(f"Не удалось посчитать BLEURT. Ошибка: {e}")


# Semantic Answer Similarity (USER-BGE-m3)
print("Вычисление Semantic Answer Similarity (BGE-m3)...")
bge_model = SentenceTransformer(BGE_MODEL_NAME)
gt_embeddings = bge_model.encode(ground_truth_answers)
gen_embeddings = bge_model.encode(generated_answers)
similarities = [cosine_similarity([gt_emb], [gen_emb])[0][0] for gt_emb, gen_emb in zip(gt_embeddings, gen_embeddings)]
semantic_similarity_score = np.mean(similarities)
print(f"Semantic Answer Similarity: {semantic_similarity_score:.4f}")


print("\n--- Вычисление метрик качества ретривера ---")

# NDCG@10 и MRR@10
relevant_ranks = []
for gt_context, retrieved_contexts in zip(ground_truth_contexts, retrieved_contexts_list):
    rank = 0
    for i, ctx in enumerate(retrieved_contexts):
        # Используем простое вхождение строки для проверки релевантности
        if gt_context in ctx:
            rank = i + 1
            break
    relevant_ranks.append(rank)

# MRR@10 (Mean Reciprocal Rank)
mrr_score = 0
for rank in relevant_ranks:
    if 0 < rank <= 10:
        mrr_score += 1 / rank
mrr_score /= len(relevant_ranks)
print(f"MRR@10: {mrr_score:.4f}")

# NDCG@10 (Normalized Discounted Cumulative Gain)
# Идеальный DCG@10 всегда равен 1, т.к. мы ищем только один релевантный документ.
# Поэтому DCG = IDCG, и NDCG = DCG.
ndcg_score = 0
for rank in relevant_ranks:
    if 0 < rank <= 10:
        ndcg_score += 1 / np.log2(rank + 1)
ndcg_score /= len(relevant_ranks)
print(f"NDCG@10: {ndcg_score:.4f}")