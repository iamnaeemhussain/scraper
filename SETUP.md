# Kurulum rehberi — sıfırdan uçtan uca

Bu doküman repoyu klonlamış birinin sıfır bilgiyle backend + Flutter app'i çalışır
hale getirmesi için adım adım takip edebileceği rehberdir.

İçindekiler:

1. [Gereksinimler](#1-gereksinimler)
2. [Üçüncü taraf hesaplar (eSIM Access, Stripe, Firebase)](#2-üçüncü-taraf-hesaplar)
3. [Backend ilk çalıştırma](#3-backend-ilk-çalıştırma)
4. [Public webhook URL (ngrok)](#4-public-webhook-url-ngrok)
5. [Flutter platform klasörleri](#5-flutter-platform-klasörleri-android--ios)
6. [Android konfigürasyonu](#6-android-konfigürasyonu)
7. [iOS konfigürasyonu](#7-ios-konfigürasyonu)
8. [Uçtan uca test akışı](#8-uçtan-uca-test-akışı)
9. [Production deploy notları](#9-production-deploy-notları)
10. [Sorun giderme](#10-sorun-giderme)

---

## 1) Gereksinimler

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | 20+ | `node -v` |
| npm | 10+ | Node ile gelir |
| Docker Desktop | son sürüm | Postgres + Redis için |
| Flutter SDK | 3.19+ | `flutter doctor` ile doğrulayın |
| Android Studio | son sürüm | Android emülatör + SDK |
| Xcode (sadece macOS) | 15+ | iOS build için |
| ngrok | son sürüm | webhook için public URL (alternatif: Cloudflare Tunnel) |
| Stripe CLI | son sürüm | local Stripe webhook forwarding için (opsiyonel ama önerilir) |
| Git | herhangi | repo |

Windows kullanıcılarıysanız iOS build için Mac şart. Sadece Android'i denemek için Mac gerekmez.

---

## 2) Üçüncü taraf hesaplar

### 2.1 eSIM Access (zorunlu)

1. https://console.esimaccess.com/login → hesap aç.
2. Sol menüden **Partner Bill** → küçük bir tutar deposit edin (test için $5–10 yeterli; her test gerçek bakiyeden harcar, **sandbox yok**).
3. Sol menüden **Developer** → `AccessCode`'u kopyalayın. Bu **server-side** anahtardır; **mobile'a hiç gönderilmez**.
4. Backend'i ayağa kaldırdıktan sonra (Adım 4'te) public webhook URL'i otomatik kaydedilecek; manuel kaydetmek isterseniz aynı sayfadan da yapılabilir.

### 2.2 Stripe (zorunlu — ödeme akışı için)

1. https://dashboard.stripe.com/register → hesap aç (test modunda başlayın).
2. **Developers → API keys** sayfasından:
   - `STRIPE_PUBLISHABLE_KEY` (`pk_test_...`) → mobil app'e gider
   - `STRIPE_SECRET_KEY` (`sk_test_...`) → backend env'ine gider
3. **Developers → Webhooks** → **Add endpoint**:
   - URL: önce local için Stripe CLI ile forward edeceğiz (adım 4'te); prod'da `https://your-domain/webhooks/stripe`
   - Olaylar: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Oluşturulan **Signing secret**'ı kopyalayın → `STRIPE_WEBHOOK_SECRET` (`whsec_...`).

### 2.3 Firebase (FCM push için — opsiyonel ama F4 push bildirimleri için zorunlu)

1. https://console.firebase.google.com → **Add project** → adı: `esim-app`.
2. **Project settings → Service accounts → Generate new private key** → JSON indirin.
   - Bu dosyayı `backend/fcm-service-account.json` olarak kaydedin (`.gitignore` zaten kapsıyor).
3. Android için **Add app → Android**:
   - applicationId: `com.example.esim` (kendi reverse-DNS adınız)
   - `google-services.json` dosyasını indirin → `mobile/android/app/google-services.json` olarak koyun.
4. iOS için **Add app → iOS**:
   - bundleId: `com.example.esim`
   - `GoogleService-Info.plist` indirin → `mobile/ios/Runner/GoogleService-Info.plist`.

Firebase'i şimdilik atlayabilirsiniz; backend'i FCM olmadan da çalıştırabilirsiniz (push'lar sadece loglanır).

---

## 3) Backend ilk çalıştırma

### 3.1 Env dosyasını hazırlayın

```powershell
cd C:\Users\Recep\Desktop\Projects\esim
copy .env.example .env
```

`.env` dosyasını açıp en az şunları doldurun:

```
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
ESIMACCESS_ACCESS_CODE=<eSIM Access konsolundan aldığınız kod>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

> Windows'ta hızlı rastgele anahtar:
> ```powershell
> [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
> ```

### 3.2 Postgres + Redis ayağa kaldırın

```powershell
docker compose up -d
docker compose ps   # postgres + redis "healthy" görünmeli
```

### 3.3 Backend'i kurun ve ilk migration'ı çalıştırın

```powershell
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

İlk migration başarılı olduğunda `backend/prisma/migrations/<timestamp>_init/` klasörü oluşur.

### 3.4 Backend'i başlatın

```powershell
npm run start:dev
```

Şunu görmelisiniz:

```
[esim-backend] listening on :3000
```

Sağlık kontrolü:

```powershell
curl http://localhost:3000/health
# {"status":"ok","db":"ok","time":"2026-..."}
```

Bu noktada API çalışıyor ama eSIM Access webhook'larını alamaz çünkü URL'i public değil. Sıradaki adım.

---

## 4) Public webhook URL (ngrok)

eSIM Access ve Stripe sizin sunucunuza POST yapacak; localhost erişilemez. ngrok ile geçici bir public URL açıyoruz.

### 4.1 ngrok

```powershell
# Hesap açtıktan sonra (https://dashboard.ngrok.com), authtoken'ı bir kez kaydedin:
ngrok config add-authtoken <token>

ngrok http 3000
```

Çıktıda göreceğiniz `Forwarding https://abcd-1234.ngrok-free.app -> http://localhost:3000` URL'sini kopyalayın.

### 4.2 eSIM Access webhook URL'sini kaydedin

`.env`'i güncelleyin:

```
APP_BASE_URL=https://abcd-1234.ngrok-free.app
ESIMACCESS_REGISTER_WEBHOOK=true
```

Backend'i yeniden başlatın. Boot log'unda şunu görmelisiniz:

```
[WebhookBootstrap] Registered eSIM Access webhook URL: https://abcd-1234.ngrok-free.app/webhooks/esimaccess
```

eSIM Access size hemen bir `CHECK_HEALTH` event'i gönderir; webhook controller log'unda görünür.

> **Uyarı:** Free ngrok URL'i her açılışta değişir. Yeni URL'i her seferinde env'e yazıp backend'i yeniden başlatmanız gerekir. Sabit bir URL için ngrok'un ücretli planı veya Cloudflare Tunnel kullanılabilir.

### 4.3 Stripe webhook forwarding

İki seçenek:

**Seçenek A — Stripe CLI ile local forward (geliştirme için en pratiği):**

```powershell
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Bu komutun çıktısında bir geçici `whsec_...` görünür; bunu `STRIPE_WEBHOOK_SECRET`'a yazıp backend'i yeniden başlatın.

**Seçenek B — Stripe Dashboard webhook (ngrok ile):**

Dashboard → Webhooks → Endpoint URL: `https://abcd-1234.ngrok-free.app/webhooks/stripe`. Signing secret'ı `.env`'e yazın.

### 4.4 Hızlı doğrulama

```powershell
# Yeni bir terminalden:
curl -X POST http://localhost:3000/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"test@example.com\",\"password\":\"test1234\"}'
# {"accessToken":"...","refreshToken":"...","expiresIn":900}
```

```powershell
# Region listesi (tedarikçiden cache'lenir):
curl http://localhost:3000/regions | jq '. | length'
```

İlk çağrı eSIM Access'e gider, sonraki çağrılar 24 saat boyunca Redis cache'ten döner.

---

## 5) Flutter platform klasörleri (Android + iOS)

Proje kökünde sadece `lib/`, `pubspec.yaml` var. Platform klasörlerini Flutter üretir:

```powershell
cd C:\Users\Recep\Desktop\Projects\esim\mobile
flutter create --platforms=android,ios --org com.example.esim .
flutter pub get
```

> `com.example.esim` yerine kendi reverse-DNS namespace'inizi yazın (örn. `com.sirketadi.esim`). Sonradan değiştirmek mümkün ama zahmetlidir.

---

## 6) Android konfigürasyonu

### 6.1 minSdk

`mobile/android/app/build.gradle` içinde `defaultConfig`'i şu hale getirin (flutter_stripe ve secure_storage minimum 21+ ister):

```gradle
defaultConfig {
    applicationId "com.example.esim"
    minSdkVersion 21
    targetSdkVersion flutter.targetSdkVersion
    versionCode flutterVersionCode.toInteger()
    versionName flutterVersionName
}
```

### 6.2 Firebase (google-services.json)

Eğer push istiyorsanız:

1. `mobile/android/app/google-services.json` dosyasının var olduğundan emin olun.
2. `mobile/android/build.gradle`'a (project-level):
   ```gradle
   dependencies {
       classpath 'com.google.gms:google-services:4.4.1'
   }
   ```
3. `mobile/android/app/build.gradle`'a (app-level) en alta:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```

### 6.3 İnternet izni

`mobile/android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
```

### 6.4 Stripe (Android)

Eklenmesi gereken bir şey yok — `flutter_stripe` paketi gerekli ne varsa kendi `AndroidManifest.xml`'ine ekler.

---

## 7) iOS konfigürasyonu

> Sadece macOS'ta. Windows'tan iOS build edilemez.

### 7.1 Bundle ID + signing

Xcode'da `mobile/ios/Runner.xcworkspace`'i açın. **Runner → Signing & Capabilities** → Team seçin, Bundle Identifier'ı kontrol edin (`com.example.esim`).

### 7.2 Minimum iOS

`mobile/ios/Podfile`:

```ruby
platform :ios, '13.0'
```

`mobile/ios/Runner/Info.plist`:

```xml
<key>MinimumOSVersion</key>
<string>13.0</string>
```

### 7.3 Firebase (GoogleService-Info.plist)

`mobile/ios/Runner/GoogleService-Info.plist` dosyasını Xcode'dan **Runner target**'ına ekleyin (sadece dosyayı koymak yetmez — Xcode'dan "Add files to Runner..." ile eklenmeli).

### 7.4 Push capability

Xcode → Signing & Capabilities → **+ Capability** → **Push Notifications** ekleyin. Ayrıca **Background Modes** → "Remote notifications" işaretleyin.

### 7.5 ATS (HTTP testleri için, opsiyonel)

ngrok HTTPS verdiği için ek ayar gerekmez. Eğer ileride sadece HTTP test URL'i ile çalışacaksanız `Info.plist`'e `NSAppTransportSecurity` ekleyin.

### 7.6 Pod install

```bash
cd mobile/ios
pod install
cd ..
```

---

## 8) Uçtan uca test akışı

### 8.1 Mobil çalıştırma

**Android emülatör** (host backend'e `10.0.2.2` ile erişir):

```powershell
cd mobile
flutter run `
  --dart-define=API_BASE_URL=http://10.0.2.2:3000 `
  --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**iOS simülatör** (host backend'e `localhost` ile erişir):

```bash
flutter run -d ios \
  --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...
```

> Public webhook URL ile test ediyorsanız mobil app `API_BASE_URL` olarak da ngrok URL'sini kullanabilir; HTTPS olduğu için tercih edilir.

### 8.2 Akış

1. App açılır → giriş ekranı → **Kayıt ol**.
2. Email + 8+ karakter parola → ana sayfada ülke listesi (regions cache'i ile).
3. Bir ülke (örn. `JP` Japonya) seçin → paket listesi yüklenir.
4. Küçük bir paket seçin (~$1) → **Satın al** → Stripe sheet açılır.
5. Test kartı: `4242 4242 4242 4242`, ay/yıl gelecekte, CVC `123`, ZIP `12345`.
6. Ödeme başarılı → "eSIM hazırlanıyor" ekranı → backend:
   - Stripe webhook → orders PAID → eSIM Access'e `placeOrder(transactionId, ...)`
   - Tedarikçi → `ORDER_STATUS=GOT_RESOURCE` webhook'u → backend `queryEsim` → ICCID + LPA + QR DB'ye yazılır
   - 30–60sn içinde ekran otomatik eSIM detayına geçer
7. **eSIM detayında:** QR kod görünür, **Tek tıkla yükle** butonu (iOS 17.4+) veya manuel kurulum bilgileri.
8. eSIM'i fiziksel cihazda kurmadan **iptal etmek için**:

   ```powershell
   curl -X POST http://localhost:3000/admin/esim/cancel `
        -H "Authorization: Bearer <JWT>" `
        -d '{"esimTranNo":"..."}'
   ```

   > Admin endpoint'i henüz yok; F6 için planlanmıştı. Şimdilik Prisma Studio'dan `Esim` satırını silebilir veya doğrudan tedarikçi konsolundan iptal edebilirsiniz: https://console.esimaccess.com/order-management

### 8.3 Webhook akışını doğrulama

```powershell
# Backend log'unda şunları görmelisiniz:
# [EsimAccessWebhookController] Received CHECK_HEALTH ...
# (Stripe ödeme sonrası)
# [StripeWebhookController] payment_intent.succeeded ...
# [EsimAccessWebhookProcessor] Handling ORDER_STATUS notifyId=...
```

```powershell
# DB'yi inceleyin:
cd backend
npm run prisma:studio
```

`WebhookEvent` tablosunda alınan tüm event'ler, `Esim` tablosunda QR + LPA kayıtlı olmalı.

---

## 9) Production deploy notları

### 9.1 Backend (Fly.io örneği)

```bash
fly launch       # Dockerfile yoksa otomatik üretir; PG ve Redis için Fly Postgres / Upstash önerilir
fly secrets set ESIMACCESS_ACCESS_CODE=... STRIPE_SECRET_KEY=... ...
fly deploy
```

Public URL elde ettiğinizde:

- `APP_BASE_URL=https://api.example.com` setleyin
- `ESIMACCESS_REGISTER_WEBHOOK=true` setleyin
- İlk boot'ta otomatik webhook kaydı yapılır
- Stripe dashboard'da prod webhook endpoint'i tanımlayın → yeni `STRIPE_WEBHOOK_SECRET` alın

### 9.2 Mobil

**Android:**

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.example.com \
  --dart-define=STRIPE_PUBLISHABLE_KEY=pk_live_...
```

`mobile/android/key.properties` ile imza anahtarı kurulumu için: https://docs.flutter.dev/deployment/android#signing-the-app

**iOS:**

```bash
flutter build ipa --release \
  --dart-define=API_BASE_URL=https://api.example.com \
  --dart-define=STRIPE_PUBLISHABLE_KEY=pk_live_...
```

App Store Connect yükleme için Xcode → Organizer → Distribute.

### 9.3 KVKK / privacy

- Privacy policy URL'i mağaza sayfalarında zorunlu.
- App içi hesap silme akışı (Profil → Hesabı sil) iOS App Store gereği (App Review Guidelines 5.1.1(v)). Bizim implementasyonda var.
- Apple sıklıkla "carrier sözleşmeniz var mı?" diye sorar — eSIM Access'in reseller olarak çalıştığınızı belirten bir mektup sunmaya hazır olun.

### 9.4 Bakiye monitörü

eSIM Access bakiyeniz biterse siparişler `200007 — Insufficient balance` ile düşer. Servis 25% ve 10% eşiklerinde webhook gönderir (`notifyType: LOW_BALANCE` benzeri); şu an processor'da `default` branş'a düşer. Üretimde bunu Slack/email'e bağlamak iyi olur.

---

## 10) Sorun giderme

| Belirti | Olası neden | Çözüm |
|---|---|---|
| `Prisma migrate` "connection refused" | Docker postgres ayakta değil | `docker compose ps` ile kontrol; `docker compose up -d` |
| eSIM Access çağrıları 401 / `RT-AccessCode` | `ESIMACCESS_ACCESS_CODE` boş | `.env` doldur, backend yeniden başlat |
| Webhook hiç gelmiyor | ngrok URL değişti | Yeni URL'i `.env`'e yaz, backend yeniden başlat (otomatik re-register tetiklenir) |
| Stripe webhook 400 "Bad signature" | `STRIPE_WEBHOOK_SECRET` yanlış | Stripe CLI'dan ya da dashboard webhook ayrıntısından kopyala |
| Sipariş `PAID` kalıyor, `PROVISIONED` olmuyor | eSIM Access webhook erişemiyor / yanlış URL | `WebhookEvent` tablosunda `ORDER_STATUS` var mı kontrol et; yoksa tedarikçi konsolda manuel "Resend" |
| `BigInt` JSON hatası backend log'unda | yeni endpoint BigInt döndürüyor, `bigIntToString` unutuldu | Controller dönüş değerini `bigIntToString(...)`'den geçir |
| Flutter `MissingPluginException(... flutter_secure_storage)` | iOS pod install yapılmamış | `cd mobile/ios && pod install` |
| Android emülatörden backend'e erişilmiyor | `localhost` kullanıldı | `10.0.2.2:3000` kullanın |
| iOS simülatörde Stripe sheet açılmıyor | `STRIPE_PUBLISHABLE_KEY` boş veya yanlış | `--dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...` ile başlatın |
| `package_code does not exist` (310241) | slug değişmiş / paket kaldırılmış | `/regions` ve `/packages` cache'lerini invalide et: `redis-cli FLUSHDB` |
| `Insufficient account balance` (200007) | eSIM Access bakiye bitti | Console → Partner Bill → deposit |

---

## Ek: Faydalı komutlar

```powershell
# Backend log'unda hangi env aktif:
cd backend; npm run start:dev

# Prisma UI:
npm run prisma:studio

# DB sıfırla (DİKKAT — tüm veri silinir):
npm run prisma:migrate -- reset

# Redis cache'i temizle:
docker exec -it esim-redis redis-cli FLUSHDB

# Postgres'e bağlan:
docker exec -it esim-postgres psql -U esim -d esim

# eSIM Access doğrudan ping:
curl -X POST https://api.esimaccess.com/api/v1/open/balance/query `
  -H "RT-AccessCode: $env:ESIMACCESS_ACCESS_CODE"
```
