-- E-mails do questionário pós já enviados (convite no dia 14, lembrete no 18). A linha é reservada antes
-- do envio: o UNIQUE impede que reinício, deploy ou rodadas concorrentes mandem o mesmo e-mail de novo.
CREATE TABLE questionario_emails (
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo varchar(20) NOT NULL CHECK (tipo IN ('convite_pos', 'lembrete_pos')),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, tipo)
);
