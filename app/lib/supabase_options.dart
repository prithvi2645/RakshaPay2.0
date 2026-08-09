/// Supabase configuration. Values are injected at build time and never
/// hardcoded, so the key never reaches the repository:
///
///   flutter run --dart-define-from-file=env.json
///
/// Copy env.example.json to env.json (gitignored) and fill it in. Without it
/// the app still runs — it just has no community sync, since all scoring
/// happens on-device regardless.
class SupabaseOptions {
  static const String url = String.fromEnvironment('SUPABASE_URL');
  static const String publishableKey = String.fromEnvironment('SUPABASE_KEY');

  static bool get isConfigured => url.isNotEmpty && publishableKey.isNotEmpty;
}
