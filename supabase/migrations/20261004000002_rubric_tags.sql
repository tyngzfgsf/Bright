-- Skill tags on rubric items so a later skill profile can aggregate by area.
-- Vocabulary (validated in functions/_shared/sim/rubric.ts): airway, breathing, circulation, assessment,
-- medication, communication, escalation, safety. Adds "tags" only to items that have none, so it is idempotent
-- and never overwrites hand-edited tags. A no-op on a database whose scenarios table is still empty
-- (seed.sql applies the same update after seeding).
with tagmap (id, tags) as (values
  ('CA-RESPONSE', '["assessment"]'::jsonb),
  ('CA-HELP',     '["escalation","communication"]'::jsonb),
  ('CA-CPR',      '["circulation"]'::jsonb),
  ('CA-RHYTHM',   '["circulation"]'::jsonb),
  ('CA-DRUGS',    '["medication"]'::jsonb),
  ('CA-CAUSES',   '["assessment"]'::jsonb),
  ('AN-RECOGNISE','["assessment"]'::jsonb),
  ('AN-EPI',      '["medication"]'::jsonb),
  ('AN-HELP',     '["escalation"]'::jsonb),
  ('AN-POSITION', '["circulation"]'::jsonb),
  ('AN-SUPPORT',  '["breathing","circulation"]'::jsonb),
  ('AN-REPEAT',   '["medication"]'::jsonb),
  ('ST-RECOGNISE','["assessment"]'::jsonb),
  ('ST-ONSET',    '["assessment"]'::jsonb),
  ('ST-GLUCOSE',  '["assessment"]'::jsonb),
  ('ST-IMAGING',  '["escalation"]'::jsonb),
  ('ST-TREAT',    '["medication"]'::jsonb),
  ('ST-SUPPORT',  '["airway","safety"]'::jsonb)
)
update public.scenarios s
   set rubric = (
     select coalesce(jsonb_agg(
              case when m.tags is not null and not (e.item ? 'tags')
                   then e.item || jsonb_build_object('tags', m.tags) else e.item end
              order by e.ord), '[]'::jsonb)
       from jsonb_array_elements(s.rubric) with ordinality as e(item, ord)
       left join tagmap m on m.id = e.item ->> 'id')
 where jsonb_typeof(s.rubric) = 'array' and jsonb_array_length(s.rubric) > 0;
