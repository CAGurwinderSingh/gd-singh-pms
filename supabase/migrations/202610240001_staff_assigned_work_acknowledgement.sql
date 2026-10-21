-- Staff access control and task completion acknowledgement
-- Apply after the existing v0.3/v0.4 migrations.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS acknowledgement_number text;

-- Replace broad internal visibility with assignment-scoped staff visibility.
DROP POLICY IF EXISTS "tasks_select_internal" ON public.tasks;
CREATE POLICY "tasks_select_assigned_or_management" ON public.tasks
FOR SELECT TO authenticated
USING (
  public.current_role() IN ('partner','manager')
  OR (public.is_active_user() AND assignee_id = auth.uid())
);

DROP POLICY IF EXISTS "tasks_update_internal" ON public.tasks;
CREATE POLICY "tasks_update_assigned_or_management" ON public.tasks
FOR UPDATE TO authenticated
USING (
  public.current_role() IN ('partner','manager')
  OR (public.is_active_user() AND assignee_id = auth.uid())
)
WITH CHECK (
  public.current_role() IN ('partner','manager')
  OR (public.is_active_user() AND assignee_id = auth.uid())
);

-- Staff can see client details only for clients linked to their assigned tasks.
DROP POLICY IF EXISTS "clients_select_internal" ON public.clients;
CREATE POLICY "clients_select_assigned_or_management" ON public.clients
FOR SELECT TO authenticated
USING (
  public.current_role() IN ('partner','manager')
  OR (
    public.is_active_user() AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.client_id = clients.id AND t.assignee_id = auth.uid()
    )
  )
);

-- Do not allow staff to create tasks or change task ownership/details.
DROP POLICY IF EXISTS "tasks_insert_internal" ON public.tasks;
CREATE POLICY "tasks_insert_management_only" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (public.current_role() IN ('partner','manager'));

-- Hide recurring service templates from staff at the database layer too.
DROP POLICY IF EXISTS "templates_select_internal" ON public.recurring_templates;
CREATE POLICY "templates_select_management_only" ON public.recurring_templates
FOR SELECT TO authenticated
USING (public.current_role() IN ('partner','manager'));

-- Enforce staff restrictions even if they call the Supabase API directly.
CREATE OR REPLACE FUNCTION public.enforce_staff_task_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_role() = 'staff' THEN
    IF OLD.assignee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Staff can update only tasks assigned to them';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','completed_at','acknowledgement_number','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','completed_at','acknowledgement_number','updated_at']) THEN
      RAISE EXCEPTION 'Staff may update only status, completion date and acknowledgement number';
    END IF;
    IF NEW.status = 'completed' THEN
      IF NEW.completed_at IS NULL THEN
        RAISE EXCEPTION 'Enter the task completion date before marking it completed';
      END IF;
      IF NULLIF(trim(NEW.acknowledgement_number), '') IS NULL THEN
        RAISE EXCEPTION 'Enter the acknowledgement / filing reference before marking it completed';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_staff_task_update ON public.tasks;
CREATE TRIGGER enforce_staff_task_update
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_task_update();

-- Preserve a user-entered completion date instead of replacing it with now().
CREATE OR REPLACE FUNCTION public.assign_task_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.task_code IS NULL OR trim(NEW.task_code) = '' THEN
    NEW.task_code := 'TS-' || upper(substr(replace(NEW.id::text,'-',''),1,8));
  END IF;
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Staff may read only assigned task rows; no client/task deletion rights are added.

-- Staff cannot change client records or create/delete task records.
DROP POLICY IF EXISTS "clients_insert_internal" ON public.clients;
CREATE POLICY "clients_insert_management_only" ON public.clients
FOR INSERT TO authenticated WITH CHECK (public.current_role() IN ('partner','manager'));
DROP POLICY IF EXISTS "clients_update_internal" ON public.clients;
CREATE POLICY "clients_update_management_only" ON public.clients
FOR UPDATE TO authenticated USING (public.current_role() IN ('partner','manager'))
WITH CHECK (public.current_role() IN ('partner','manager'));

-- Restrict task comments and review history to management or people attached to that task.
DROP POLICY IF EXISTS "comments_select_internal" ON public.task_comments;
CREATE POLICY "comments_select_assigned_or_management" ON public.task_comments
FOR SELECT TO authenticated USING (
  public.current_role() IN ('partner','manager') OR EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_comments.task_id
      AND (t.assignee_id = auth.uid() OR t.reviewer_id = auth.uid())
  )
);
DROP POLICY IF EXISTS "comments_insert_internal" ON public.task_comments;
CREATE POLICY "comments_insert_management_only" ON public.task_comments
FOR INSERT TO authenticated WITH CHECK (public.current_role() IN ('partner','manager') AND author_id=auth.uid());
DROP POLICY IF EXISTS "comments_delete_author_or_partner" ON public.task_comments;
CREATE POLICY "comments_delete_management_only" ON public.task_comments
FOR DELETE TO authenticated USING (public.current_role() IN ('partner','manager'));

DROP POLICY IF EXISTS "task_reviews_select_internal" ON public.task_reviews;
CREATE POLICY "task_reviews_select_assigned_or_management" ON public.task_reviews
FOR SELECT TO authenticated USING (
  public.current_role() IN ('partner','manager') OR EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_reviews.task_id
      AND (t.assignee_id = auth.uid() OR t.reviewer_id = auth.uid())
  )
);
