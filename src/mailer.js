function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendAdminSetupEmail({ to, name, organizationName, resetLink }) {
  if (!hasSmtpConfig()) {
    console.log(`Admin setup link for ${to}: ${resetLink}`);
    return { sent: false, resetLink };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Feature Flags <no-reply@example.com>',
    to,
    subject: `Set your admin password for ${organizationName}`,
    text: [
      `Hi ${name || 'there'},`,
      '',
      `Your admin account for ${organizationName} is ready.`,
      'Set your password using this one-time link:',
      resetLink,
      '',
      'This link expires soon. If you did not expect this account, ignore this email.'
    ].join('\n')
  });

  return { sent: true };
}

module.exports = {
  sendAdminSetupEmail
};
