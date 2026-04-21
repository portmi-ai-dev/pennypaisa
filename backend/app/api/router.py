from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from fastapi import APIRouter

api_router = APIRouter()


def _load_router(file_name: str):
    file_path = Path(__file__).resolve().parent.parent / "health" / file_name
    spec = spec_from_file_location(file_name.replace("-", "_"), file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")

    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.router


api_router.include_router(_load_router("sever-health.py"))
api_router.include_router(_load_router("redis-health.py"))
api_router.include_router(_load_router("db-health.py"))
api_router.include_router(_load_router("gemini-health.py"))