-- Example scenarios for local testing (ko + en). system_prompt = the case description the server
-- wraps in its fixed drill template; rubric = checklist graded by `grade` and cited by `chat`.
insert into public.scenarios (slug, language, title, system_prompt, rubric) values
('cardiac-arrest', 'en', 'Cardiac arrest',
 'An adult found collapsed in a public place: unresponsive, not breathing normally. Reveal findings only as the trainee asks or acts.',
 '[{"id":"CA-RESPONSE","text":"Checks responsiveness and breathing (no more than 10 seconds) and recognises arrest","points":2},
   {"id":"CA-HELP","text":"Calls for help / activates the emergency response and requests an AED or defibrillator","points":2},
   {"id":"CA-CPR","text":"Starts high-quality chest compressions: centre of chest, about 5-6 cm deep, 100-120 per minute, full recoil, minimal interruptions","points":3},
   {"id":"CA-RHYTHM","text":"Applies pads/monitor early and delivers a shock if the rhythm is shockable (VF/pulseless VT)","points":2},
   {"id":"CA-DRUGS","text":"Obtains IV/IO access and gives epinephrine at the guideline interval after the first shock (non-shockable: as soon as possible)","points":1},
   {"id":"CA-CAUSES","text":"Considers reversible causes (Hs and Ts)","points":1}]'::jsonb),
('cardiac-arrest', 'ko', '심정지',
 '공공장소에서 쓰러진 성인 환자: 의식이 없고 정상적인 호흡이 없습니다. 훈련생이 질문하거나 행동할 때만 소견을 알려 주세요.',
 '[{"id":"CA-RESPONSE","text":"의식과 호흡을 확인(10초 이내)하고 심정지를 인지한다","points":2},
   {"id":"CA-HELP","text":"도움을 요청하고 응급 대응 체계를 활성화하며 AED/제세동기를 요청한다","points":2},
   {"id":"CA-CPR","text":"양질의 가슴압박을 시작한다: 가슴 중앙, 약 5-6cm 깊이, 분당 100-120회, 완전한 이완, 중단 최소화","points":3},
   {"id":"CA-RHYTHM","text":"패드/모니터를 조기에 부착하고 제세동이 필요한 리듬(심실세동/무맥성 심실빈맥)이면 제세동한다","points":2},
   {"id":"CA-DRUGS","text":"정맥/골내 접근을 확보하고 가이드라인 간격에 맞춰 에피네프린을 투여한다","points":1},
   {"id":"CA-CAUSES","text":"가역적 원인(Hs와 Ts)을 고려한다","points":1}]'::jsonb),
('anaphylaxis', 'en', 'Anaphylaxis',
 'An adult develops hives, throat tightness and wheeze minutes after a bee sting, with dropping blood pressure.',
 '[{"id":"AN-RECOGNISE","text":"Recognises anaphylaxis from skin plus airway/breathing/circulation involvement after a likely trigger","points":2},
   {"id":"AN-EPI","text":"Gives intramuscular epinephrine promptly (adult 0.3-0.5 mg, anterolateral thigh) before antihistamines or steroids","points":3},
   {"id":"AN-HELP","text":"Calls for help / emergency services and removes the trigger if possible","points":1},
   {"id":"AN-POSITION","text":"Positions the patient supine with legs raised (or seated if breathless); does not let them stand","points":1},
   {"id":"AN-SUPPORT","text":"Gives high-flow oxygen, establishes IV access and gives a fluid bolus for hypotension","points":2},
   {"id":"AN-REPEAT","text":"Repeats epinephrine in 5-15 minutes if no response and plans observation for biphasic reaction","points":1}]'::jsonb),
('anaphylaxis', 'ko', '아나필락시스',
 '성인이 벌에 쏘인 지 몇 분 만에 두드러기, 목 조임, 쌕쌕거림이 생기고 혈압이 떨어지고 있습니다.',
 '[{"id":"AN-RECOGNISE","text":"가능한 유발 요인 후 피부 증상과 기도/호흡/순환 이상이 함께 나타나는 아나필락시스를 인지한다","points":2},
   {"id":"AN-EPI","text":"항히스타민제나 스테로이드보다 먼저 에피네프린을 근육주사한다(성인 0.3-0.5mg, 대퇴 외측)","points":3},
   {"id":"AN-HELP","text":"도움/응급 서비스를 요청하고 가능하면 유발 요인을 제거한다","points":1},
   {"id":"AN-POSITION","text":"다리를 올린 앙와위(호흡곤란 시 앉은 자세)를 취하게 하고 일어서지 못하게 한다","points":1},
   {"id":"AN-SUPPORT","text":"고유량 산소를 투여하고 정맥로를 확보하며 저혈압에는 수액 볼루스를 투여한다","points":2},
   {"id":"AN-REPEAT","text":"반응이 없으면 5-15분 후 에피네프린을 반복하고 재발성(이상성) 반응을 위해 관찰을 계획한다","points":1}]'::jsonb),
('stroke', 'en', 'Acute stroke',
 'An older adult with sudden right-sided weakness and slurred speech noticed 40 minutes ago, arriving to the ED.',
 '[{"id":"ST-RECOGNISE","text":"Recognises stroke signs (e.g. FAST) and treats it as time-critical","points":2},
   {"id":"ST-ONSET","text":"Establishes last-known-well time","points":2},
   {"id":"ST-GLUCOSE","text":"Checks blood glucose to exclude hypoglycaemia mimic","points":1},
   {"id":"ST-IMAGING","text":"Arranges urgent non-contrast CT head to exclude haemorrhage; activates stroke team","points":3},
   {"id":"ST-TREAT","text":"Considers reperfusion (thrombolysis within the guideline window; thrombectomy for large-vessel occlusion)","points":1},
   {"id":"ST-SUPPORT","text":"Keeps nil by mouth until swallow screen, monitors airway and avoids aggressive BP lowering unless indicated","points":1}]'::jsonb),
('stroke', 'ko', '급성 뇌졸중',
 '40분 전 갑자기 우측 편마비와 어눌한 말이 나타난 고령 환자가 응급실에 도착했습니다.',
 '[{"id":"ST-RECOGNISE","text":"뇌졸중 징후(예: FAST)를 인지하고 시간이 중요한 응급으로 다룬다","points":2},
   {"id":"ST-ONSET","text":"마지막 정상 확인 시각을 확인한다","points":2},
   {"id":"ST-GLUCOSE","text":"저혈당 유사 증상을 배제하기 위해 혈당을 확인한다","points":1},
   {"id":"ST-IMAGING","text":"출혈 배제를 위한 응급 비조영 두부 CT를 시행하고 뇌졸중 팀을 가동한다","points":3},
   {"id":"ST-TREAT","text":"재관류 치료(가이드라인 시간 내 혈전용해, 대혈관 폐색 시 혈전제거술)를 고려한다","points":1},
   {"id":"ST-SUPPORT","text":"삼킴 평가 전까지 금식하고 기도를 감시하며 필요 없는 적극적 혈압 강하는 피한다","points":1}]'::jsonb);

-- Rubric skill tags for the scenarios above (same idempotent statement as migration 20261004000002_rubric_tags.sql,
-- which has nothing to update on a fresh database because migrations run before this seed).
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
