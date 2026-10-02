# GPU reconstruction worker. Not part of the Next.js runtime.
# Requires an NVIDIA GPU + nvidia-container-toolkit on the host.
#
# Tools installed here (existing OSS, not a custom 3DGS implementation):
#   FFmpeg, COLMAP, nerfstudio gsplat simple_trainer, PlayCanvas SplatTransform

FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WORK_DIR=/work \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GSPLAT_EXAMPLES_DIR=/opt/gsplat/examples \
    SPLAT_BACKEND=gsplat \
    CUDA_HOME=/usr/local/cuda \
    NODE_VERSION=20.18.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        software-properties-common \
        ca-certificates \
        curl \
        git \
        bash \
        xz-utils \
        ffmpeg \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && add-apt-repository -y universe \
    && apt-get update \
    && apt-get install -y --no-install-recommends colmap \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
        | tar -xJ -C /usr/local --strip-components=1 \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124 \
    && pip install --no-cache-dir gsplat \
    && pip install --no-cache-dir \
        tyro \
        imageio \
        imageio-ffmpeg \
        tqdm \
        tensorboard \
        pyyaml \
        viser \
        torchmetrics \
        nerfview

RUN git clone --depth 1 https://github.com/nerfstudio-project/gsplat.git /opt/gsplat

RUN npm install -g @playcanvas/splat-transform

WORKDIR /opt/worker

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py errors.py storage.py validate.py pipeline.py process.py ./
COPY scripts ./scripts
RUN chmod +x scripts/*.sh \
    && mkdir -p /work

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["python", "process.py", "serve", "--host", "0.0.0.0", "--port", "8080"]
