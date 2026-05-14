import os

bind = "0.0.0.0:8000"
worker_class = "uvicorn.workers.UvicornWorker"

workers = int(os.getenv("WEB_CONCURRENCY", "4"))
threads = int(os.getenv("WEB_THREADS", "1"))

# Keep timeouts reasonable for upstream proxies while allowing slow requests.
timeout = int(os.getenv("WEB_TIMEOUT", "60"))
keepalive = int(os.getenv("WEB_KEEPALIVE", "5"))
graceful_timeout = int(os.getenv("WEB_GRACEFUL_TIMEOUT", "30"))

# Recycle workers to avoid memory leaks over long uptimes.
max_requests = int(os.getenv("WEB_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("WEB_MAX_REQUESTS_JITTER", "100"))

loglevel = os.getenv("LOG_LEVEL", "info")
accesslog = "-"
errorlog = "-"
