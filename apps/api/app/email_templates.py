from html import escape


def verification_email(*, full_name: str, verification_url: str, frontend_url: str) -> str:
    """Build the account-verification email using broadly supported email HTML."""
    safe_name = escape(full_name.strip() or "Reader")
    safe_url = escape(verification_url, quote=True)
    image_url = escape(
        f"{frontend_url.rstrip('/')}/assets/verification/four-musketeers-welcome.png",
        quote=True,
    )

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>Verify your Orphaleia account</title>
  </head>
  <body style="margin:0; padding:0; background:#f3efe7; color:#18201d;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      Confirm your email and open the door to your Orphaleia reader account.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; background:#f3efe7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px; background:#fdfbf7; border:1px solid #ded8cd;">
            <tr>
              <td style="padding:28px 34px 24px; border-bottom:1px solid #e6e0d6;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-family:Georgia, 'Times New Roman', serif; font-size:25px; line-height:1; color:#18201d;">
                      Orphaleia
                    </td>
                    <td align="right" style="font-family:Arial, sans-serif; font-size:10px; line-height:1.4; letter-spacing:1.5px; color:#587066;">
                      INDEPENDENT BOOKSELLERS
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0; background:#f8f2e7;">
                <img src="{image_url}" width="600" alt="Four literary companions welcoming a reader into the Orphaleia library" style="display:block; width:100%; max-width:600px; height:auto; border:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:42px 42px 18px;">
                <p style="margin:0 0 14px; font-family:Arial, sans-serif; font-size:10px; line-height:1.4; font-weight:700; letter-spacing:1.7px; color:#285f4c;">
                  READER ACCOUNT
                </p>
                <h1 style="margin:0 0 20px; font-family:Georgia, 'Times New Roman', serif; font-size:38px; line-height:1.12; font-weight:400; letter-spacing:-0.7px; color:#18201d;">
                  Your next chapter starts here.
                </h1>
                <p style="margin:0 0 14px; font-family:Arial, sans-serif; font-size:16px; line-height:1.65; color:#405049;">
                  Hello {safe_name},
                </p>
                <p style="margin:0; font-family:Arial, sans-serif; font-size:16px; line-height:1.65; color:#405049;">
                  Confirm your email to finish creating your Orphaleia account. Once verified, you can place orders, save your details and share ratings with other readers.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 42px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td bgcolor="#285f4c" style="background:#285f4c;">
                      <a href="{safe_url}" style="display:inline-block; padding:15px 25px; font-family:Arial, sans-serif; font-size:14px; line-height:1.2; font-weight:700; color:#ffffff; text-decoration:none;">
                        Verify my email
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 42px 42px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; border-top:1px solid #e4ded3;">
                  <tr>
                    <td style="padding-top:22px;">
                      <p style="margin:0 0 10px; font-family:Arial, sans-serif; font-size:13px; line-height:1.55; color:#68736d;">
                        This private link expires in 24 hours. If you did not create an Orphaleia account, you can safely ignore this message.
                      </p>
                      <p style="margin:0 0 8px; font-family:Arial, sans-serif; font-size:12px; line-height:1.5; color:#7a827e;">
                        Button not working? Copy and paste this address into your browser:
                      </p>
                      <p style="margin:0; font-family:Arial, sans-serif; font-size:11px; line-height:1.55; word-break:break-all; color:#285f4c;">
                        <a href="{safe_url}" style="color:#285f4c; text-decoration:underline;">{safe_url}</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 34px; background:#18201d;">
                <p style="margin:0; font-family:Arial, sans-serif; font-size:11px; line-height:1.6; color:#d8ddd9;">
                  Orphaleia · Independent bookselling for restless minds and unhurried shelves.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
