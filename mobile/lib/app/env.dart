// Build-time environment, injected via --dart-define.
//
// Example:
//   flutter run --dart-define=API_BASE_URL=https://pak-tel.com/api

class Env {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );
}
