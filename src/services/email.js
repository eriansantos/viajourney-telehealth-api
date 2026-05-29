import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export function emailIsConfigured() {
  return Boolean(resend);
}

const MONTHS_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function formatDatetime(iso) {
  if (!iso) return null;
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const time = (timePart || "").slice(0, 5);
  return `${d} de ${MONTHS_PT[m - 1]} de ${y} às ${time} (horário de Brasília/ET)`;
}

function planDescription(planSlug) {
  const map = {
    "consulta-avulsa": { label: "Consulta Avulsa", type: "consulta única" },
    "clube-saude":     { label: "Clube Saúde",     type: "assinatura mensal" },
    "concierge":       { label: "Via Journey Concierge", type: "assinatura mensal" },
  };
  return map[planSlug] || { label: planSlug, type: "plano" };
}

function buildHtml({ firstName, planSlug, appointmentDatetime, membershipId }) {
  const plan = planDescription(planSlug);
  const slotLine = appointmentDatetime
    ? `<p style="margin:0 0 8px">🗓️ <strong>Sua primeira consulta:</strong> ${formatDatetime(appointmentDatetime)}</p>`
    : `<p style="margin:0 0 8px">📅 Você pode <strong>agendar sua consulta</strong> a qualquer momento respondendo este email ou acessando o portal.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="background:#009a58;padding:28px 32px;text-align:center">
            <img src="https://viajourney-checkout-prod.vercel.app/logo-alt.png"
                 alt="Via Journey Telehealth" height="40"
                 style="display:block;margin:0 auto 8px">
            <p style="margin:0;color:#ffffff;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.85">
              Confirmação de Plano
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px">
            <h1 style="margin:0 0 16px;font-size:22px;color:#003d31;font-weight:700">
              Bem-vindo(a), ${firstName}! 🎉
            </h1>
            <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.6">
              Seu <strong>${plan.label}</strong> foi ativado com sucesso.
              Você agora tem acesso à Via Journey Telehealth.
            </p>

            <!-- Detalhes -->
            <div style="background:#f0faf5;border-radius:10px;padding:18px 20px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.8">
              <p style="margin:0 0 8px">✅ <strong>Plano:</strong> ${plan.label} (${plan.type})</p>
              ${slotLine}
              ${membershipId ? `<p style="margin:0;color:#888;font-size:12px">ID da assinatura: ${membershipId}</p>` : ""}
            </div>

            <!-- Próximos passos -->
            <h2 style="margin:0 0 12px;font-size:16px;color:#003d31">Próximos passos</h2>
            <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#444;line-height:1.8">
              <li>Você receberá um convite para criar seu perfil no portal de pacientes.</li>
              <li>Verifique sua caixa de entrada para confirmar o agendamento.</li>
              <li>Em caso de dúvidas, responda este email — estamos aqui.</li>
            </ol>

            <a href="https://viajourneytelehealth.com"
               style="display:inline-block;background:#009a58;color:#ffffff;font-size:15px;font-weight:600;
                      padding:12px 28px;border-radius:8px;text-decoration:none;box-shadow:0 4px 0 #003d31">
              Acessar Portal
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 28px;border-top:1px solid #eee">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;text-align:center">
              Via Journey Telehealth · Lakewood Ranch, FL<br>
              Dúvidas? Responda este email ou escreva para
              <a href="mailto:contact@viajourneytelehealth.com" style="color:#009a58">contact@viajourneytelehealth.com</a>
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

  const plan = planDescription(planSlug);
  const subject = `✅ ${plan.label} ativado — Bem-vindo(a) à Via Journey!`;

  const { data, error } = await resend.emails.send({
    from: "Via Journey Telehealth <noreply@viajourneytelehealth.com>",
    to,
    subject,
    html: buildHtml({ firstName, planSlug, appointmentDatetime, membershipId }),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  return { sent: true, id: data?.id };
}
