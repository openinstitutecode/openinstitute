<?php
/**
 * Batch 47 — one-command Moodle web-services provisioning.
 *
 * Replaces this manual sequence from Site administration > Server >
 * Web services: enable web services, enable REST, create a service,
 * add functions to it, create a service account, authorise it, and
 * generate a token — done by hand it's ~15 clicks across 4 screens
 * per token. This does all of it in one non-interactive run and
 * prints the two values backend/.env actually needs.
 *
 * Usage (after finish-plugin-install.sh, so auth_userkey is on disk):
 *   docker compose exec moodle php /provision-moodle.php
 *
 * Idempotent — safe to re-run. Reuses the service/user/token if they
 * already exist instead of duplicating them.
 *
 * HONESTY NOTE (same standard as docs/moodle-integration.md): this is
 * written against Moodle's documented external-service management API
 * (lib/externallib.php — the `webservice` class and
 * webservice_generate_token()), which is exactly what the Web services
 * admin screens call internally. It has not been run against a live
 * Moodle instance in this environment (no network/DB access here) —
 * treat it the same as the rest of the moodle/*.ts modules: syntax-
 * reviewed, not live-verified. If a Moodle version has changed one of
 * these signatures, the error message will point at the line to fix.
 */

define('CLI_SCRIPT', true);
require(__DIR__ . '/config.php');
require_once($CFG->libdir . '/externallib.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/user/lib.php');

/** Find or create a dedicated, never-logged-in-via-UI service account. */
function kvbdtc_get_or_create_service_user(string $username, string $lastname): stdClass {
    global $DB, $CFG;
    if ($existing = $DB->get_record('user', ['username' => $username, 'deleted' => 0])) {
        return $existing;
    }
    $user = new stdClass();
    $user->username = $username;
    // Random, never surfaced anywhere — this account only ever
    // authenticates via web service token, never a password login.
    $user->password = base64_encode(random_bytes(24));
    $user->firstname = 'Measur Business College';
    $user->lastname = $lastname;
    $user->email = $username . '@kvbdtc.invalid';
    $user->confirmed = 1;
    $user->mnethostid = $CFG->mnet_localhost_id;
    $user->auth = 'manual';
    $userid = user_create_user($user, false, false);
    return $DB->get_record('user', ['id' => $userid]);
}

/** Create the external service if missing, and make sure it has every function this app needs. */
function kvbdtc_ensure_service(webservice $manager, string $shortname, string $name, array $functions): stdClass {
    global $DB;
    $service = $manager->get_external_service_by_shortname($shortname, IGNORE_MISSING);
    if (!$service) {
        $service = new stdClass();
        $service->name = $name;
        $service->shortname = $shortname;
        $service->enabled = 1;
        $service->restrictedusers = 1; // only explicitly authorised users, not "all users"
        $service->downloadfiles = 0;
        $service->uploadfiles = 0;
        $service->id = $manager->add_external_service($service);
    } else if (!$service->enabled) {
        $service->enabled = 1;
        $DB->update_record('external_services', $service);
    }
    foreach ($functions as $fn) {
        if (!$manager->service_function_exists($fn, $service->id)) {
            $manager->add_service_function($fn, $service->id);
        }
    }
    return $service;
}

function kvbdtc_ensure_authorised(webservice $manager, stdClass $service, stdClass $user): void {
    $authorised = $manager->get_ws_authorised_users($service->id) ?: [];
    foreach ($authorised as $a) {
        if ((int)$a->userid === (int)$user->id) return;
    }
    $auth = new stdClass();
    $auth->serviceid = $service->id;
    $auth->userid = $user->id;
    $manager->add_ws_authorised_user($auth);
}

function kvbdtc_ensure_token(stdClass $service, stdClass $user): string {
    global $DB;
    $existing = $DB->get_record('external_tokens', ['userid' => $user->id, 'externalserviceid' => $service->id]);
    if ($existing) return $existing->token;
    $context = context_system::instance();
    return webservice_generate_token(EXTERNAL_TOKEN_PERMANENT, $service, $user->id, $context);
}

// --- Enable web services + the REST protocol (Site administration >
// Server > Web services > Overview, steps 1-2) ---
set_config('enablewebservices', 1);
$protocols = get_config('core', 'webserviceprotocols');
$protocols = $protocols ? explode(',', $protocols) : [];
if (!in_array('rest', $protocols, true)) {
    $protocols[] = 'rest';
    set_config('webserviceprotocols', implode(',', $protocols));
}

$manager = new webservice();

// --- Main integration token — every wsfunction backend/src/moodle/
// {courseSync,enrolment,userSync,liveClasses}.ts actually calls ---
$mainFunctions = [
    'core_course_create_courses',
    'core_course_update_courses',
    'core_course_get_courses_by_field',
    'core_course_get_contents',
    'core_user_create_users',
    'core_user_get_users_by_field',
    'enrol_manual_enrol_users',
    'enrol_manual_unenrol_users',
    'core_enrol_get_enrolled_users',
    'core_role_get_roles',
];
$mainService = kvbdtc_ensure_service($manager, 'kvbdtc_integration', 'Measur Business College Integration', $mainFunctions);
$mainUser = kvbdtc_get_or_create_service_user('kvbdtc_integration_svc', 'Integration Service');
kvbdtc_ensure_authorised($manager, $mainService, $mainUser);
$mainToken = kvbdtc_ensure_token($mainService, $mainUser);

cli_writeln('');
cli_writeln('# Paste these into backend/.env, then restart the backend.');
cli_writeln('MOODLE_BASE_URL=' . rtrim($CFG->wwwroot, '/'));
cli_writeln('MOODLE_WS_TOKEN=' . $mainToken);

// --- SSO token — auth_userkey's login-url function, only if the
// plugin is actually on disk and installed (finish-plugin-install.sh) ---
$authUserkeyInstalled = $DB->record_exists('config_plugins', ['plugin' => 'auth_userkey', 'name' => 'version']);
if ($authUserkeyInstalled) {
    // Exact wsfunction name auth_userkey registers is version-dependent
    // (some releases expose auth_userkey_request_login_url, others
    // namespace it differently) — this MUST match the string
    // backend/src/moodle/sso.ts calls; if the service creation below
    // fails with "invalid function", check
    // {MOODLE_ROOT}/auth/userkey/db/services.php for the real name and
    // fix both places.
    $ssoFunctions = ['auth_userkey_request_login_url'];
    try {
        $ssoService = kvbdtc_ensure_service($manager, 'kvbdtc_sso', 'Measur Business College SSO (auth_userkey)', $ssoFunctions);
        $ssoUser = kvbdtc_get_or_create_service_user('kvbdtc_sso_svc', 'SSO Service');
        kvbdtc_ensure_authorised($manager, $ssoService, $ssoUser);
        $ssoToken = kvbdtc_ensure_token($ssoService, $ssoUser);
        cli_writeln('MOODLE_SSO_WS_TOKEN=' . $ssoToken);
    } catch (Throwable $e) {
        cli_writeln('# Could not provision the SSO service automatically: ' . $e->getMessage());
        cli_writeln('# Check auth/userkey/db/services.php for the real function name (see comment above) and re-run.');
    }
} else {
    cli_writeln('# MOODLE_SSO_WS_TOKEN not generated — auth_userkey is not installed yet.');
    cli_writeln('# Run: docker compose exec moodle bash /finish-plugin-install.sh, then re-run this script.');
}

cli_writeln('');
cli_writeln('Still manual — Moodle admin UI, no CLI equivalent for either:');
cli_writeln('  - Authentication > Manage authentication methods: enable "User key" (auth_userkey),');
cli_writeln('    with Mapping field = username.');
cli_writeln('  - mod_bigbluebuttonbn\'s server URL/secret, and a tool_trigger rule');
cli_writeln('    posting to /api/moodle/webhooks/events (see finish-plugin-install.sh output).');
