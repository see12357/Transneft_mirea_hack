import pandas as pd
import evaluate
import numpy as np
import time
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough, RunnableParallel
from langchain_core.output_parsers import StrOutputParser
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# --- НАСТРОЙКИ ---
BENCHMARK_FILE_PATH = "benchmark.csv"
FAISS_INDEX_PATH = "data/faiss_index_gemma"
OLLAMA_MODEL_NAME = "gemma3:4b-it-qat"
OLLAMA_BASE_URL = "http://ollama:11434"
EMBEDDING_MODEL_NAME = "google/embeddinggemma-300m"
BGE_MODEL_NAME = "BAAI/bge-m3"

# --- 1. ЗАГРУЗКА RAG-СИСТЕМЫ И БЕНЧМАРКА ---

print("Загрузка RAG-системы...")
start_time = time.time()

embedding_model = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL_NAME, model_kwargs={'device': 'cpu'})
vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings=embedding_model, allow_dangerous_deserialization=True)
retriever = vector_store.as_retriever(search_kwargs={'k': 10})
llm = ChatOllama(model=OLLAMA_MODEL_NAME, temperature=0.1, base_url=OLLAMA_BASE_URL)

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

# <-- УЛУЧШЕНИЕ: Создаем эффективную цепочку, которая возвращает и ответ, и контекст
# Это позволит избежать двойного вызова ретривера.
map_docs = RunnableParallel(
    context=retriever | format_docs,
    question=RunnablePassthrough()
)
rag_chain = map_docs | prompt | llm | StrOutputParser()

# Цепочка для получения только документов
retriever_chain = retriever.with_config(run_name="DocsRetriever")

# Финальная параллельная цепочка
full_chain = RunnableParallel(
    generated_answer=rag_chain,
    retrieved_docs=retriever_chain
)

print(f"RAG-система загружена за {time.time() - start_time:.2f} сек.")

print(f"Загрузка бенчмарка из {BENCHMARK_FILE_PATH}...")
df = pd.read_csv(BENCHMARK_FILE_PATH)
questions = df['question'].tolist()
ground_truth_answers = df['ground_truth_answer'].tolist()
ground_truth_contexts = [str(ctx).strip().lower() for ctx in df['ground_truth_context'].tolist()]

# --- 2. ГЕНЕРАЦИЯ ОТВЕТОВ И ПОЛУЧЕНИЕ КОНТЕКСТА ---

print("Генерация ответов по бенчмарку... Это может занять некоторое время.")
start_time = time.time()

# <-- УЛУЧШЕНИЕ: Используем .batch() для параллельной обработки всех вопросов. Это НАМНОГО быстрее!
results = full_chain.batch(questions)

generated_answers = [res['generated_answer'] for res in results]
retrieved_contexts_list = [[doc.page_content for doc in res['retrieved_docs']] for res in results]

print(f"Ответы сгенерированы за {time.time() - start_time:.2f} сек.")

# --- 3. ВЫЧИСЛЕНИЕ МЕТРИК ---

print("\n--- Вычисление метрик качества генерации ---")

rouge = evaluate.load('rouge')
rouge_results = rouge.compute(predictions=generated_answers, references=ground_truth_answers)
print(f"ROUGE-L: {rouge_results['rougeL']:.4f}")

try:
    bleurt = evaluate.load("bleurt", module_type="metric", checkpoint="bleurt-20")
    bleurt_results = bleurt.compute(predictions=generated_answers, references=ground_truth_answers)
    print(f"BLEURT-20 (среднее): {np.mean(bleurt_results['scores']):.4f}")
except Exception as e:
    print(f"Не удалось посчитать BLEURT. Ошибка: {e}")

print("Вычисление Semantic Answer Similarity (BGE-m3)...")
bge_model = SentenceTransformer(BGE_MODEL_NAME)
gt_embeddings = bge_model.encode(ground_truth_answers)
gen_embeddings = bge_model.encode(generated_answers)
similarities = [cosine_similarity([gt_emb], [gen_emb])[0][0] for gt_emb, gen_emb in zip(gt_embeddings, gen_embeddings)]
semantic_similarity_score = np.mean(similarities)
print(f"Semantic Answer Similarity: {semantic_similarity_score:.4f}")

print("\n--- Вычисление метрик качества ретривера ---")

relevant_ranks = []
for gt_context, retrieved_contexts in zip(ground_truth_contexts, retrieved_contexts_list):
    rank = 0
    # <-- УЛУЧШЕНИЕ: Более надежная проверка релевантности
    for i, ctx in enumerate(retrieved_contexts):
        if gt_context in ctx.strip().lower():
            rank = i + 1
            break
    relevant_ranks.append(rank)

mrr_score = 0
for rank in relevant_ranks:
    if 0 < rank <= 10:
        mrr_score += 1 / rank
mrr_score /= len(relevant_ranks)
print(f"MRR@10: {mrr_score:.4f}")

ndcg_score = 0
for rank in relevant_ranks:
    if 0 < rank <= 10:
        ndcg_score += 1 / np.log2(rank + 1)
ndcg_score /= len(relevant_ranks)
print(f"NDCG@10: {ndcg_score:.4f}")