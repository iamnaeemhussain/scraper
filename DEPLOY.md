# Sunucu kurulumu — Linux VPS + Docker + Caddy

Bu rehber **temiz bir Ubuntu/Debian VPS'e** her şeyi tek sunucuda kurar:
PostgreSQL + Redis + NestJS backend + Caddy (otomatik HTTPS).

> Yerel geliştirme rehberi: [SETUP.md](./SETUP.md). Bu dosya yalnız production deploy içindir.

## Genel akış

```
sunucu kur → DNS yönlendir → repo deploy → ilk start → webhook'ları kaydet → test
```

---

## 1) Sunucu önkoşulları

VPS sağlayıcısının panelinden Ubuntu 22.04 LTS (veya Debian 12) seçin. SSH ile root olarak bağlanın.

### 1.1 Temel güvenlik & güncelleme

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban git curl

# Firewall: 22 (SSH), 80 (HTTP), 443 (HTTPS)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Otomatik güvenlik güncellemeleri
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

### 1.2 Non-root deploy kullanıcısı (önerilen)

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# SSH anahtarını kopyala (root'unkini deploy'a)
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# (Opsiyonel) root SSH'ı kapat
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload ssh
```

Bundan sonra `ssh deploy@<sunucu-ip>` ile bağlanın.

### 1.3 Swap (2GB RAM'lik bir sunucu için)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 1.4 Docker + Docker Compose

```bash
# Resmi Docker repo
curl -fsSL https://get.docker.com | sudo sh

# deploy kullanıcısını docker grubuna ekle (sudo'suz docker)
sudo usermod -aG docker deploy
# logout/login yap ki grup aktif olsun
exit
ssh deploy@<sunucu-ip>

docker --version
docker compose version
```

---

## 2) Domain DNS yönlendirmesi

Domain sağlayıcınızın panelinde (Cloudflare, GoDaddy, Namecheap vb.):

| Tür | Ad | Değer |
|---|---|---|
| A | `api` | `<sunucu-public-ip>` |
| AAAA | `api` | `<sunucu-ipv6>` (varsa) |

DNS yayılması 1–30 dk sürebilir. Test:

```bash
# Sunucudan değil dış bir yerden (laptop):
nslookup api.domain.com
# veya
dig +short api.domain.com
```

Sonuç sunucu IP'sini göstermelidir. Bu hazır olmadan Caddy SSL alamaz.

> **Cloudflare proxy:** Eğer Cloudflare kullanıyorsanız önce **DNS only** (gri bulut) modunda bırakın. SSL Caddy ile Let's Encrypt'ten alındıktan sonra proxy'i (turuncu bulut) açabilirsiniz; o zaman SSL/TLS modunu **Full (strict)** seçin.

---

## 3) Repo'yu sunucuya getir

İki yol var:

**A) Git ile (GitHub'a push'ladıysanız):**
```bash
cd ~
git clone https://github.com/<kullanici>/<repo>.git esim
cd esim
```

**B) rsync ile (laptop'tan doğrudan):**
```powershell
# Laptop'ta:
rsync -avz --exclude node_modules --exclude .git `
  C:/Users/Recep/Desktop/Projects/esim/ `
  deploy@<sunucu-ip>:/home/deploy/esim/
```

Sunucuda:
```bash
cd ~/esim
ls   # backend/  mobile/  docker-compose.prod.yml  Caddyfile.example  .env.example
```

---

## 4) Env ve Caddyfile hazırla

### 4.1 .env

```bash
cd ~/esim
cp .env.example .env
nano .env
```

Doldur:

```bash
# === Database ===
POSTGRES_PASSWORD=<openssl rand -hex 24>

# === Backend ===
APP_BASE_URL=https://api.domain.com
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

# === eSIM Access ===
ESIMACCESS_ACCESS_CODE=<console.esimaccess.com'dan>

# === Stripe (önce test mode ile başla) ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=<adım 6.2'de doldurulacak>

# === SMTP (örnek: Resend / SendGrid / Mailgun) ===
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_...
SMTP_FROM="eSIM <no-reply@domain.com>"
```

> Güçlü secret üretmek:
> ```bash
> openssl rand -hex 32   # 64-karakter hex
> ```

### 4.2 Caddyfile

```bash
cp Caddyfile.example Caddyfile
nano Caddyfile
```

`api.example.com`'u kendi alt-domain'iniz ile değiştirin. Email'i kendi adresinizle değiştirin.

### 4.3 FCM service account (push istiyorsanız)

```bash
mkdir -p secrets/fcm
nano secrets/fcm/fcm-service-account.json   # Firebase Console'dan indirdiğiniz JSON'u yapıştır
chmod 600 secrets/fcm/fcm-service-account.json
```

> FCM yoksa bu adımı atlayın; backend log'a `FCM credentials not configured — push notifications disabled.` der.

---

## 5) İlk çalıştırma

```bash
cd ~/esim

# Build + start (ilk seferde 3-5 dk sürer — image'lar çekilir, npm install çalışır)
docker compose -f docker-compose.prod.yml up -d --build

# Logları izle
docker compose -f docker-compose.prod.yml logs -f backend
```

Beklenen başarı çıktısı:

```
esim-backend  | [entrypoint] Running prisma migrate deploy...
esim-backend  | Applying migration `20260513_init`
esim-backend  | [entrypoint] Starting NestJS...
esim-backend  | [esim-backend] listening on :3000
esim-backend  | [WebhookBootstrap] Registered eSIM Access webhook URL: https://api.domain.com/webhooks/esimaccess
```

`Ctrl+C` ile log izlemeyi bırak (container çalışmaya devam eder).

### 5.1 Sağlık kontrolü

```bash
curl https://api.domain.com/health
# {"status":"ok","db":"ok","time":"..."}
```

`https://` çalışıyorsa Caddy Let's Encrypt sertifikasını başarıyla aldı demektir.

İlk SSL sertifikası alımı ~30 saniye sürer. `caddy` log'unu görmek için:
```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate
```

---

## 6) Webhook'ları kaydet

### 6.1 eSIM Access webhook

Backend boot ederken otomatik olarak `setWebhook(https://api.domain.com/webhooks/esimaccess)` çağırır (env'de `ESIMACCESS_REGISTER_WEBHOOK=true` zaten compose'da set). Doğrulayın:

```bash
docker compose -f docker-compose.prod.yml logs backend | grep -i webhook
```

eSIM Access size hemen `CHECK_HEALTH` event'i gönderir; log'da:
```
[EsimAccessWebhookController] Handling CHECK_HEALTH notifyId=...
```

> Eğer log'da görünmüyorsa eSIM Access konsoluna girip Developer → Webhooks sayfasından manuel olarak `https://api.domain.com/webhooks/esimaccess` ekleyin ve "Test" butonuna basın.

### 6.2 Stripe webhook

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- Endpoint URL: `https://api.domain.com/webhooks/stripe`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
- Add endpoint

Açılan ekranda **Signing secret** (`whsec_...`) görünür. Kopyalayın:

```bash
cd ~/esim
nano .env
# STRIPE_WEBHOOK_SECRET=whsec_... satırını doldur
docker compose -f docker-compose.prod.yml up -d backend   # backend container'ını recreate eder
```

Stripe sayfasındaki **"Send test webhook"** ile bir `payment_intent.succeeded` deneyin. Backend log'da:
```
[StripeWebhookController] Handling event payment_intent.succeeded
```

---

## 7) Uçtan uca canlı test

1. eSIM Access konsoluna ($5–10) deposit edin.
2. Mobil app'i bu API'ye yönelterek build edin:
   ```powershell
   flutter run `
     --dart-define=API_BASE_URL=https://api.domain.com `
     --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. App → kayıt ol → ülke seç → ucuz bir paket al
4. Stripe test kartı: `4242 4242 4242 4242` / `12/30` / `123`
5. 30–60 saniye içinde eSIM detayı QR + LPA ile görünmeli
6. QR'ı **gerçek cihaza kurmadan** test bitirmek için: ya app'i kapat, ya da `console.esimaccess.com` → Order Management'tan iptal et (bakiye iade edilir).

---

## 8) Operasyon kılavuzu

### 8.1 Logları okuma

```bash
cd ~/esim

# Canlı tüm servisler
docker compose -f docker-compose.prod.yml logs -f

# Sadece backend
docker compose -f docker-compose.prod.yml logs -f backend

# Son 100 satır
docker compose -f docker-compose.prod.yml logs --tail 100 backend
```

### 8.2 Yeni sürüm deploy etme

```bash
cd ~/esim
git pull         # ya da rsync ile yeni dosyaları kopyala
docker compose -f docker-compose.prod.yml up -d --build backend
```

Migration varsa `entrypoint.sh` `prisma migrate deploy` çağırarak otomatik uygular.

### 8.3 Postgres yedeği

```bash
# Manuel
docker exec esim-postgres pg_dump -U esim esim | gzip > backup-$(date +%Y%m%d).sql.gz

# Otomatik (crontab -e):
0 3 * * * docker exec esim-postgres pg_dump -U esim esim | gzip > /home/deploy/backups/esim-$(date +\%F).sql.gz && find /home/deploy/backups -name "esim-*.sql.gz" -mtime +14 -delete
```

> Gerçek kullanıcı verisi başladığında **mutlaka** dışarıya da yedek atın (S3, Backblaze B2 vb. — `rclone` ile günlük).

### 8.4 Restore

```bash
gunzip -c backup-20260513.sql.gz | docker exec -i esim-postgres psql -U esim -d esim
```

### 8.5 Prisma Studio'yu sunucudan (SSH tüneli)

Production'da Studio'yu açık tutmayın. Geçici bakım için SSH port-forward:

```powershell
# Laptop:
ssh -L 5555:localhost:5555 deploy@<sunucu-ip>
```

Sunucuda:
```bash
docker exec -it esim-backend npx prisma studio
# Tarayıcıdan: http://localhost:5555 (laptop'tan)
```

### 8.6 Redis cache temizle

```bash
docker exec esim-redis redis-cli FLUSHDB
```

Paket listesi anında yenilenir (tedarikçi yeni paket ekledi vs.).

### 8.7 Tedarikçi bakiyesini kontrol

```bash
curl -X POST https://api.esimaccess.com/api/v1/open/balance/query \
  -H "RT-AccessCode: $(grep ESIMACCESS_ACCESS_CODE ~/esim/.env | cut -d= -f2)"
```

---

## 9) Production hardening (sonraki adımlar)

- [ ] **Stripe live mode**: Test kurulum oturduğunda Stripe'ı live'a çevir, live API anahtarları ve yeni webhook secret üret.
- [ ] **App Store onayı için**: Privacy policy + Terms of Service URL'leri yayında olsun (statik HTML servis edebilir veya https://termsfeed.com gibi araç kullanın). Apple "carrier letter" isteyebilir — eSIM Access destekten reseller olduğunuzu belirten letter isteyin.
- [ ] **Monitoring**: backend log'larını [Better Stack](https://betterstack.com), [Axiom](https://axiom.co) gibi bir yere stream edin. UptimeRobot ile `/health` ping.
- [ ] **Backup off-site**: günlük PG dump'ı S3'e kopyala.
- [ ] **Yatay ölçek istiyorsanız**: backend'i birkaç instance açın, `rate-limiter.ts` token bucket'ı Redis'e taşınmalı (şu an in-memory).
- [ ] **Postgres tuning**: 4GB+ RAM'iniz varsa `shared_buffers`, `effective_cache_size` ayarlayın.
- [ ] **Caddy security headers**: HSTS, CSP, X-Frame-Options eklenmeli (Caddyfile'da `header` directive).

---

## 10) Sorun giderme

| Belirti | Olası neden | Çözüm |
|---|---|---|
| `caddy` "no certificate" + 502 | DNS henüz yayılmadı | `dig +short api.domain.com` boş döner; yayılması bekleyin |
| Caddy "Connection refused" Let's Encrypt'e | port 80/443 firewall'da kapalı | `sudo ufw status` ile kontrol et |
| Backend 503 / "Cannot connect to DB" | postgres healthcheck geçmedi | `docker compose logs postgres` — disk dolu mu? |
| `eSIM Access 401` | yanlış / boş `ESIMACCESS_ACCESS_CODE` | `.env`'i kontrol, `docker compose up -d backend` ile recreate |
| Stripe webhook 400 "Bad signature" | yanlış `STRIPE_WEBHOOK_SECRET` veya body tampered | Stripe dashboard → webhook detay → secret tekrar kopyala |
| `request entity too large` Caddy log'da | nadir, büyük webhook payload | `Caddyfile` `request_body max_size` artır |
| Tedarikçi webhook'u geliyor ama processor patlıyor | DB migration yenisi gelmedi | `docker exec -it esim-backend npx prisma migrate status` |
| Cache eski paket gösteriyor | tedarikçide paket güncellendi | `docker exec esim-redis redis-cli FLUSHDB` |
| `Insufficient account balance` (200007) | bakiye bitti | console → Partner Bill → deposit |

---

## Ek: Hızlı komutlar cheat-sheet

```bash
# Servisleri başlat / durdur
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml down

# Yeniden başlat (config değişti)
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart caddy

# Tek bir container'a SHELL aç
docker exec -it esim-backend sh

# Disk kullanımı
docker system df
docker system prune     # kullanılmayan image/volume sil

# Eski image'ları temizle (haftalık)
docker image prune -f
```
