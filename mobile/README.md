# eSIM Mobile (Flutter)

Android + iOS uygulaması. Backend ile JWT üzerinden konuşur, ödeme için Stripe Payment Sheet kullanır.

## Çalıştırma

```bash
flutter pub get

# Android emülatörü (host backend'e 10.0.2.2 ile erişir):
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
  --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# iOS simülatör (localhost direkt çalışır):
flutter run -d ios \
  --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

> Flutter SDK kurulu değilse: https://docs.flutter.dev/get-started/install
>
> `ios/` ve `android/` platform klasörleri `flutter create .` ile üretilir (proje kökünden):
> ```bash
> flutter create --platforms=android,ios --org com.example.esim .
> ```

## Yapı

```
lib/
├── main.dart
├── app/             # router, theme, env
├── data/            # api client, models (F2'de)
├── features/        # auth, home, catalog, checkout, esim, topup, profile
└── shared/          # ortak widget'lar, utils
assets/
└── i18n/            # tr.json, en.json
```
