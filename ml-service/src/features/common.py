from src.features.python_features import extract_python_features
from src.features.cpp_features import extract_cpp_features

def extract_features(language: str, code: str) -> dict:
    lang = language.lower().strip()
    if lang in ["py", "python"]:
        return extract_python_features(code)
    if lang in ["cpp", "c++"]:
        return extract_cpp_features(code)
    # Later: java/js
    raise ValueError(f"Unsupported language for ML estimation: {language}")
