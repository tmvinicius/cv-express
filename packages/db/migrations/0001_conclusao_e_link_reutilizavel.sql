-- Conclusão do currículo e link mágico reutilizável dentro do prazo.
--
-- Regra de produto (o botão "Concluir e salvar"):
--
--   * Ao concluir, a sessão ganha um prazo FIXO: 5 dias a partir da primeira
--     conclusão. Ele não renova com acesso nem com edição.
--   * O link do e-mail vale até esse mesmo instante e pode ser usado quantas
--     vezes a pessoa quiser até lá.
--
-- Idempotente, como a 0000: pode ser aplicada de novo sem erro.

-- Quando a pessoa concluiu. NULL = rascunho, que segue a regra antiga de
-- 30 dias sem acesso.
ALTER TABLE cv_sessions ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ;

-- Link que deixou de valer antes do prazo: a pessoa trocou o e-mail e um link
-- novo foi para o endereço novo, ou o envio falhou.
ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS revogado_em TIMESTAMPTZ;

-- `usado_em` marcava o consumo do link de USO ÚNICO. Com o link reutilizável
-- ele passa a registrar o último uso, e muda de nome para não mentir.
--
-- Pela regra antiga, `usado_em` preenchido significava "este link não vale
-- mais" — fosse por resgate, fosse por um link mais novo. Esses continuam sem
-- valer: viram revogados antes da troca de nome.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'magic_links' AND column_name = 'usado_em'
  ) THEN
    UPDATE magic_links
       SET revogado_em = usado_em
     WHERE usado_em IS NOT NULL AND revogado_em IS NULL;

    ALTER TABLE magic_links RENAME COLUMN usado_em TO ultimo_uso_em;
  END IF;
END $$;
