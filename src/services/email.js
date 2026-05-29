import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export function emailIsConfigured() {
  return Boolean(resend);
}

// ─── Brand tokens (espelho de src/lib/brand.js no frontend) ──────────────────
const C = {
  dark:    "#003d31",
  primary: "#1fb54d",
  lime:    "#91c563",
  g100:    "#eef7e0",
  g50:     "#f5fbee",
  border:  "#e0e8e0",
  bg:      "#f5f7f5",
  t1:      "#1a2e1a",
  t3:      "#5a6b5a",
  t4:      "#8a9e8a",
};

const LOGO_URL  = "https://viajourney-checkout-prod.vercel.app/logo-alt.png";
const FONT_URL  = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap";
const SUPPORT   = "care@viajourneytelehealth.com";
const PORTAL    = "https://viajourneytelehealth.com";

const MONTHS_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function formatDatetime(iso) {
  if (!iso) return null;
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const time = (timePart || "").slice(0, 5);
  return `${d} de ${MONTHS_PT[m - 1]} de ${y} às ${time} (ET)`;
}

const PLANS = {
  "consulta-avulsa": { label: "Consulta Avulsa",       badge: "Consulta Única" },
  "clube-saude":     { label: "Clube Saúde",            badge: "Assinatura Mensal" },
  "concierge":       { label: "Via Journey Concierge",  badge: "Assinatura Premium" },
};

function planInfo(slug) {
  return PLANS[slug] || { label: slug, badge: "Plano", icon: "✅" };
}

function buildHtml({ firstName, planSlug, appointmentDatetime, membershipId }) {
  const plan     = planInfo(planSlug);
  const slotText = appointmentDatetime ? formatDatetime(appointmentDatetime) : null;

  const slotBlock = slotText
    ? `
      <tr>
        <td style="padding:0 0 10px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;font-size:20px">🗓️</td>
              <td style="font-family:'Poppins',Roboto,sans-serif;font-size:14px;color:${C.t1};line-height:1.5">
                <strong>Sua primeira consulta</strong><br>
                <span style="color:${C.t3}">${slotText}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : `
      <tr>
        <td style="padding:0 0 10px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;font-size:20px">📅</td>
              <td style="font-family:'Poppins',Roboto,sans-serif;font-size:14px;color:${C.t3};line-height:1.5">
                Agende sua consulta a qualquer momento respondendo este email.
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Confirmação Via Journey</title>
  <link href="${FONT_URL}" rel="stylesheet">
  <style>
    @import url('${FONT_URL}');
    body { margin:0; padding:0; background:${C.bg}; }
    * { box-sizing:border-box; }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:'Poppins',Roboto,'Helvetica Neue',sans-serif">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:${C.bg};padding:40px 16px 48px">
    <tr><td align="center">
      <table width="100%" style="max-width:580px" cellpadding="0" cellspacing="0" role="presentation">

        <!-- ── LOGO PRÉ-CARD ─────────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding-bottom:24px">
            <img src="${LOGO_URL}"
                 alt="Via Journey Telehealth" height="72"
                 style="display:block;height:72px;width:auto">
          </td>
        </tr>

        <!-- ── CARD ──────────────────────────────────────────────────── -->
        <tr>
          <td style="background:#ffffff;border-radius:20px;overflow:hidden;
                     box-shadow:0 4px 24px rgba(0,61,49,.10)">

            <!-- Header com gradiente MIV -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:${C.dark};
                            padding:36px 40px 32px;text-align:center">
                  <p style="margin:0 0 12px;font-family:'Poppins',Roboto,sans-serif;
                             font-size:13px;font-weight:600;letter-spacing:2px;
                             text-transform:uppercase;color:rgba(255,255,255,.75)">
                    Confirmação de Plano
                  </p>
                  <h1 style="margin:0;font-family:'Poppins',Roboto,sans-serif;
                             font-size:28px;font-weight:700;color:#ffffff;line-height:1.2">
                    Bem-vindo(a) à Via Journey,<br>${firstName}!
                  </h1>
                </td>
              </tr>
            </table>

            <!-- Corpo -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding:32px 40px 28px">

                  <!-- Mensagem principal -->
                  <p style="margin:0 0 24px;font-family:'Poppins',Roboto,sans-serif;
                             font-size:15px;color:${C.t3};line-height:1.7">
                    Seu plano foi ativado com sucesso. Você agora faz parte da
                    <strong style="color:${C.t1}">Via Journey Telehealth</strong> e tem acesso a
                    cuidados de saúde de qualidade onde quer que esteja.
                  </p>

                  <!-- Badge do plano -->
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                         style="background:${C.g50};border:1px solid ${C.border};
                                border-radius:12px;margin-bottom:24px">
                    <tr>
                      <td style="padding:20px 24px">
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                          <tr>
                            <td valign="middle">
                              <p style="margin:0;font-family:'Poppins',Roboto,sans-serif;
                                         font-size:17px;font-weight:700;color:${C.dark}">
                                ${plan.label}
                              </p>
                              <p style="margin:4px 0 0;font-family:'Poppins',Roboto,sans-serif;
                                         font-size:12px;font-weight:600;letter-spacing:1px;
                                         text-transform:uppercase;color:${C.primary}">
                                ${plan.badge}
                              </p>
                            </td>
                            <td align="right" valign="middle">
                              <span style="display:inline-block;background:${C.primary};color:#fff;
                                           font-family:'Poppins',Roboto,sans-serif;font-size:11px;
                                           font-weight:700;letter-spacing:.5px;padding:4px 12px;
                                           border-radius:20px">
                                ATIVO
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Detalhes da consulta -->
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                         style="margin-bottom:24px">
                    ${slotBlock}
                  </table>


                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── FOOTER ─────────────────────────────────────────────────── -->
        <tr>
          <td style="padding:24px 16px 0;text-align:center">
            <p style="margin:0 0 6px;font-family:'Poppins',Roboto,sans-serif;
                       font-size:12px;color:${C.t4}">
              Via Journey Telehealth · Lakewood Ranch, FL
            </p>
            <p style="margin:0;font-family:'Poppins',Roboto,sans-serif;
                       font-size:12px;color:${C.t4}">
              Dúvidas? <a href="mailto:${SUPPORT}"
                          style="color:${C.primary};text-decoration:none">${SUPPORT}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

export async function sendConfirmationEmail({ to, firstName, planSlug, appointmentDatetime, membershipId }) {
  if (!resend) {
    console.warn("[email] Resend não configurado — email de confirmação não enviado");
    return { skipped: true };
  }

  const plan = planInfo(planSlug);
  const subject = `Bem-vindo(a) à Via Journey Telehealth!`;

  const { data, error } = await resend.emails.send({
    from:    process.env.RESEND_FROM || "Via Journey Telehealth <onboarding@resend.dev>",
    replyTo: SUPPORT,
    to,
    subject,
    html: buildHtml({ firstName, planSlug, appointmentDatetime, membershipId }),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  return { sent: true, id: data?.id };
}
