#!/bin/bash
set -e

# ログファイル設定
LOG_FILE="/var/log/userdata.log"
exec > >(tee -a ${LOG_FILE}) 2>&1

echo "=========================================="
echo "Day 1: EC2 Setup Script Started"
echo "Timestamp: $(date)"
echo "=========================================="

# SWAPファイルの作成（t2.micro用メモリ対策）
echo "[1/7] Creating SWAP file for t2.micro instance..."
dd if=/dev/zero of=/swapfile bs=128M count=16
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab

# Docker GPGキーの追加
echo "[2/7] Adding Docker's official GPG key..."
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Dockerリポジトリの追加
echo "[3/7] Adding Docker repository to Apt sources..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Dockerのインストール
echo "[4/7] Installing Docker..."
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ubuntuユーザーをdockerグループに追加
echo "[5/7] Adding ubuntu user to docker group..."
usermod -aG docker ubuntu

# リポジトリのクローン
echo "[6/7] Cloning repository..."
cd /home/ubuntu
sudo -u ubuntu git clone https://github.com/haw/strong-system-dot-com.git
cd strong-system-dot-com

# Dockerコンテナのビルドと起動
echo "[7/7] Building and starting Docker containers..."
sudo -u ubuntu docker compose build
sudo -u ubuntu docker compose up -d

echo "=========================================="
echo "Day 1: EC2 Setup Script Completed"
echo "Timestamp: $(date)"
echo "=========================================="

# Get public IP using IMDSv2
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" -s)
PUBLIC_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/public-ipv4)

echo ""
echo "Application URLs:"
echo "  - Employee Management System: http://${PUBLIC_IP}:3000"
echo "  - Employee Management System (Replica): http://${PUBLIC_IP}:3001"
echo "  - MinIO Console: http://${PUBLIC_IP}:9001"
echo ""
echo "Note: Make sure to configure Security Group to allow the following ports:"
echo "  - 22/TCP (SSH)"
echo "  - 3000/TCP (App Server 1)"
echo "  - 3001/TCP (App Server 2)"
echo "  - 9000/TCP (MinIO API)"
echo "  - 9001/TCP (MinIO Console)"
