FROM python:3.10

WORKDIR /work

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN groupadd -r appgroup && useradd -r -g appgroup appuser
RUN mkdir -p /work/uploads && chown -R appuser:appgroup /work/uploads
USER appuser
CMD ["python", "-u", "main.py"]