FROM python:3.13-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript libglib2.0-0 libsm6 libxext6 libxrender1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY Finance.CamelotWorker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY Finance.CamelotWorker/app.py ./app.py

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
