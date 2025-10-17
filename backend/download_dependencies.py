import os
import requests
import zipfile
from pathlib import Path
from tqdm import tqdm


def download_and_unzip(url: str, target_dir: Path, final_name: str):
    """
    Скачивает zip-архив, распаковывает его и переименовывает в final_name.
    """
    if (target_dir / final_name).exists():
        print(f"Ресурс '{final_name}' уже существует в '{target_dir}'. Пропускаем.")
        return

    target_dir.mkdir(parents=True, exist_ok=True)
    temp_zip_path = target_dir / "temp.zip"

    print(f"Скачивание '{final_name}' с {url}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        with open(temp_zip_path, 'wb') as f, tqdm(
                desc="Скачивание", total=total_size, unit='iB', unit_scale=True, unit_divisor=1024
        ) as bar:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                bar.update(len(chunk))

        print(f"📦 Распаковка архива...")
        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            unzipped_folder_name = zip_ref.namelist()[0].split('/')[0]
            zip_ref.extractall(target_dir)

        (target_dir / unzipped_folder_name).rename(target_dir / final_name)

        print(f"Ресурс '{final_name}' успешно подготовлен.")

    except Exception as e:
        print(f"ОШИБКА при скачивании/распаковке: {e}")
    finally:
        if temp_zip_path.exists():
            os.remove(temp_zip_path)


if __name__ == "__main__":
    print("--- Подготовка зависимостей для бенчмарка ---")

    BLEURT_URL = "https://storage.googleapis.com/bleurt-oss-21/BLEURT-20.zip"
    CHECKPOINTS_DIR = Path("./checkpoints")
    download_and_unzip(url=BLEURT_URL, target_dir=CHECKPOINTS_DIR, final_name="BLEURT-20")

    print("\n--- Все зависимости готовы к работе! ---")