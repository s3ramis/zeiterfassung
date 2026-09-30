-- A JSON backup can legitimately be imported by a different account.
-- IDs identify records inside one account, not across all accounts.
ALTER TABLE work_plan_days ADD COLUMN user_id uuid;
UPDATE work_plan_days AS days SET user_id = plans.user_id
FROM work_plans AS plans WHERE plans.id = days.work_plan_id;
ALTER TABLE work_plan_days ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE work_plan_days DROP CONSTRAINT work_plan_days_work_plan_id_fkey;
ALTER TABLE work_plan_days DROP CONSTRAINT work_plan_days_pkey;
ALTER TABLE work_plans DROP CONSTRAINT work_plans_pkey;
ALTER TABLE work_plans ADD PRIMARY KEY (user_id, id);
ALTER TABLE work_plan_days ADD PRIMARY KEY (user_id, work_plan_id, weekday);
ALTER TABLE work_plan_days ADD FOREIGN KEY (user_id, work_plan_id)
REFERENCES work_plans(user_id, id) ON DELETE CASCADE;

ALTER TABLE time_events DROP CONSTRAINT time_events_pkey;
ALTER TABLE time_events ADD PRIMARY KEY (user_id, id);
ALTER TABLE absences DROP CONSTRAINT absences_pkey;
ALTER TABLE absences ADD PRIMARY KEY (user_id, id);
