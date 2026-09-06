#!/usr/bin/env bash
# Structural guard: this toolkit must never gain the ability to send email.
#
# Rationale: § 7 Abs. 2 UWG makes unsolicited commercial email to German
# businesses unlawful, with no B2B exemption. The safest engineering control is
# that the capability does not exist in the codebase at all. This script fails
# CI if an email transport is added.
#
# See docs/PRODUCT-SPEC.md "Hard constraints" and docs/PROMOTION.md.
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

# 1. No email transport packages in the dependency manifest.
banned_pkgs='nodemailer|@sendgrid/|postmark|mailgun|@aws-sdk/client-ses|resend|emailjs|smtp|mailjet|sparkpost'
if grep -nEi "\"($banned_pkgs)[^\"]*\"[[:space:]]*:" package.json; then
  echo "FAIL: an email-sending package is declared in package.json." >&2
  fail=1
fi

# 2. No email transport usage in source.
banned_code='nodemailer|createTransport|sendgrid|SMTPTransport|smtp://|smtps://|sendMail|send_mail'
if grep -rnEi "$banned_code" src/ 2>/dev/null; then
  echo "FAIL: email-sending code found in src/." >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "This toolkit has no email channel by design (§ 7 Abs. 2 UWG)." >&2
  echo "Outreach is telephone and postal mail only. Do not add an email channel." >&2
  exit 1
fi

echo "OK: no email-sending capability present."
