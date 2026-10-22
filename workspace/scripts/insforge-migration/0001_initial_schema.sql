-- AgentHub PostgreSQL initial schema.
-- Generated from workspace/backend/app/models.py; keep in sync with Alembic head.
-- Idempotent for fresh InsForge imports. Do not wrap in BEGIN/COMMIT.


CREATE TABLE IF NOT EXISTS agents (
	agent_name TEXT NOT NULL,
	display_name TEXT,
	agent_type TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (agent_name)
);


CREATE TABLE IF NOT EXISTS events (
	id TEXT NOT NULL,
	network_id UUID NOT NULL,
	type TEXT NOT NULL,
	source TEXT NOT NULL,
	target TEXT NOT NULL,
	payload JSONB,
	metadata JSONB,
	timestamp BIGINT NOT NULL,
	visibility TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id)
);


CREATE TABLE IF NOT EXISTS users (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	email TEXT NOT NULL,
	firebase_uid TEXT,
	apple_sub TEXT,
	display_name TEXT,
	avatar_url TEXT,
	welcome_seen BOOLEAN DEFAULT FALSE NOT NULL,
	email_verified_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	last_login_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_users_email UNIQUE (email)
);


CREATE TABLE IF NOT EXISTS workspaces (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	slug TEXT,
	name TEXT NOT NULL,
	creator_email TEXT,
	password_hash TEXT,
	require_login BOOLEAN DEFAULT TRUE NOT NULL,
	legacy_machine_access BOOLEAN DEFAULT FALSE NOT NULL,
	settings JSONB,
	status TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	UNIQUE (slug)
);


CREATE TABLE IF NOT EXISTS agent_grants (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	agent_name TEXT NOT NULL,
	grantee_email TEXT NOT NULL,
	granted_by TEXT,
	note TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	revoked_at TIMESTAMP WITH TIME ZONE,
	revoked_by TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS agent_pins (
	workspace_id UUID NOT NULL,
	user_email TEXT NOT NULL,
	agent_name TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (workspace_id, user_email, agent_name),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS agent_services (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	agent_name TEXT NOT NULL,
	owner_email TEXT NOT NULL,
	name TEXT NOT NULL,
	description TEXT DEFAULT '' NOT NULL,
	instructions TEXT DEFAULT '' NOT NULL,
	example_requests JSONB DEFAULT '[]' NOT NULL,
	required_inputs TEXT,
	allowed_knowledge JSONB DEFAULT '[]' NOT NULL,
	request_approver_email TEXT,
	cost_owner TEXT DEFAULT 'owner' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS agent_watches (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	watcher_agent TEXT NOT NULL,
	origin_channel TEXT NOT NULL,
	subject_kind TEXT NOT NULL,
	subject TEXT NOT NULL,
	note TEXT,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	max_fires INTEGER DEFAULT '10' NOT NULL,
	fires INTEGER DEFAULT '0' NOT NULL,
	status TEXT DEFAULT 'active' NOT NULL,
	last_fired_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS approval_policies (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	channel_name TEXT DEFAULT '*' NOT NULL,
	rules JSONB NOT NULL,
	updated_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_approval_policies_ws_channel UNIQUE (workspace_id, channel_name),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS approvals (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	channel_name TEXT NOT NULL,
	requested_by TEXT NOT NULL,
	kind TEXT NOT NULL,
	action TEXT NOT NULL,
	details TEXT,
	risk TEXT,
	required_role TEXT DEFAULT 'any' NOT NULL,
	assignee_email TEXT,
	policy_requirements JSONB,
	status TEXT DEFAULT 'pending' NOT NULL,
	resolved_by TEXT,
	resolved_by_role TEXT,
	resolved_at TIMESTAMP WITH TIME ZONE,
	note TEXT,
	request_event_id TEXT,
	resolution_event_id TEXT,
	expires_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS browser_contexts (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	name TEXT NOT NULL,
	bb_context_id TEXT,
	domain TEXT,
	status TEXT NOT NULL,
	created_by TEXT NOT NULL,
	shared_with JSONB,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_browser_context_workspace_name UNIQUE (workspace_id, name),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS browser_usage (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	tab_id TEXT NOT NULL,
	session_id TEXT,
	opened_by TEXT NOT NULL,
	started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
	ended_at TIMESTAMP WITH TIME ZONE,
	duration_seconds INTEGER,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS campaign_accounts (
	user_id UUID NOT NULL,
	gateway_key_id INTEGER NOT NULL,
	api_key TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS campaign_grants (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	user_id UUID NOT NULL,
	milestone TEXT NOT NULL,
	amount_usd FLOAT NOT NULL,
	new_limit_usd FLOAT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_campaign_grants_user_milestone UNIQUE (user_id, milestone),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS channel_briefs (
	workspace_id UUID NOT NULL,
	channel_name TEXT NOT NULL,
	objective TEXT,
	owner TEXT,
	latest_result TEXT,
	open_questions JSONB,
	next_step TEXT,
	updated_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (workspace_id, channel_name),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS cloud_agent_configs (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	agent_name TEXT NOT NULL,
	provider TEXT NOT NULL,
	model TEXT NOT NULL,
	category TEXT NOT NULL,
	api_key TEXT NOT NULL,
	base_url TEXT,
	system_prompt TEXT,
	max_tokens INTEGER,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_cloud_agent_workspace_name UNIQUE (workspace_id, agent_name),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS device_tokens (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	fcm_token TEXT NOT NULL,
	device_type TEXT NOT NULL,
	bundle_id TEXT,
	user_email TEXT,
	prefs JSONB,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_device_token_workspace_fcm UNIQUE (workspace_id, fcm_token),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS direct_thread_links (
	id UUID NOT NULL,
	workspace_id UUID NOT NULL,
	session_key TEXT NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_direct_thread_link UNIQUE (workspace_id, session_key),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS feedback (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	user_id UUID,
	user_email TEXT,
	workspace_id TEXT,
	kind TEXT NOT NULL,
	message TEXT NOT NULL,
	context JSONB,
	status TEXT DEFAULT 'new' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS files (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	filename TEXT NOT NULL,
	content_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	storage_key TEXT NOT NULL,
	uploaded_by TEXT NOT NULL,
	channel_name TEXT,
	status TEXT NOT NULL,
	owner TEXT,
	visibility TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	deleted_at TIMESTAMP WITH TIME ZONE,
	trash_id TEXT,
	trash_path TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS integration_bindings (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	platform TEXT NOT NULL,
	name TEXT,
	bot_token TEXT NOT NULL,
	signing_secret TEXT,
	webhook_secret TEXT,
	external_team_id TEXT,
	default_agent TEXT,
	config JSONB,
	status TEXT NOT NULL,
	last_error TEXT,
	last_event_at TIMESTAMP WITH TIME ZONE,
	created_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS invitations (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	target_agent TEXT NOT NULL,
	invite_token TEXT NOT NULL,
	status TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	UNIQUE (invite_token)
);


CREATE TABLE IF NOT EXISTS issues (
	knowledge_ids JSONB DEFAULT '[]' NOT NULL,
	file_ids JSONB DEFAULT '[]' NOT NULL,
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	title TEXT NOT NULL,
	description TEXT DEFAULT '' NOT NULL,
	status TEXT DEFAULT 'open' NOT NULL,
	assignee TEXT,
	assignee_name TEXT,
	labels JSONB DEFAULT '[]' NOT NULL,
	participants JSONB DEFAULT '[]' NOT NULL,
	created_by TEXT NOT NULL,
	created_by_name TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS knowledge_entries (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	folder_path TEXT DEFAULT '' NOT NULL,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	description TEXT,
	storage_key TEXT,
	content_size INTEGER,
	created_by TEXT NOT NULL,
	updated_by TEXT,
	status TEXT NOT NULL,
	owner TEXT,
	visibility TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_knowledge_workspace_slug UNIQUE (workspace_id, slug),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS knowledge_folders (
	workspace_id UUID NOT NULL,
	path TEXT NOT NULL,
	PRIMARY KEY (workspace_id, path),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS message_reactions (
	event_id TEXT NOT NULL,
	user_email TEXT NOT NULL,
	emoji TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (event_id, user_email, emoji),
	FOREIGN KEY(event_id) REFERENCES events (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS model_access (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	label TEXT NOT NULL,
	provider TEXT NOT NULL,
	base_url TEXT,
	api_key TEXT NOT NULL,
	created_by TEXT,
	status TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS node_pairing_codes (
	code TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	created_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	redeemed_at TIMESTAMP WITH TIME ZONE,
	node_id UUID,
	PRIMARY KEY (code),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS nodes (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	owner_email TEXT,
	legacy_workspace_token BOOLEAN DEFAULT FALSE NOT NULL,
	node_key TEXT NOT NULL,
	token TEXT,
	name TEXT,
	hostname TEXT,
	device_type TEXT,
	os TEXT,
	launcher_version TEXT,
	status TEXT,
	last_heartbeat TIMESTAMP WITH TIME ZONE,
	agents JSONB,
	runtimes JSONB,
	fs JSONB,
	capabilities JSONB DEFAULT '[]' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_node_workspace_key_owner UNIQUE (workspace_id, node_key, owner_email),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS notifications (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	created_by TEXT NOT NULL,
	title TEXT NOT NULL,
	message TEXT NOT NULL,
	priority TEXT NOT NULL,
	is_read BOOLEAN DEFAULT FALSE,
	channel_name TEXT,
	thread_id TEXT,
	link_url TEXT,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	read_at TIMESTAMP WITH TIME ZONE,
	recipient_email TEXT,
	kind TEXT,
	action_ref TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS resource_grants (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	resource_kind TEXT NOT NULL,
	resource_id TEXT NOT NULL,
	grantee_kind TEXT NOT NULL,
	grantee_id TEXT NOT NULL,
	rights JSONB NOT NULL,
	scope JSONB,
	expires_at TIMESTAMP WITH TIME ZONE,
	budget NUMERIC,
	granted_by TEXT,
	note TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	revoked_at TIMESTAMP WITH TIME ZONE,
	revoked_by TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS routines (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	channel_name TEXT NOT NULL,
	thread_id TEXT,
	created_by TEXT NOT NULL,
	name TEXT NOT NULL,
	message TEXT NOT NULL,
	context TEXT,
	schedule_hour INTEGER,
	schedule_minute INTEGER,
	schedule_days JSONB,
	schedule_interval_minutes INTEGER,
	timezone TEXT,
	next_fires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	last_fired_at TIMESTAMP WITH TIME ZONE,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS security_groups (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	name TEXT NOT NULL,
	slug TEXT NOT NULL,
	kind TEXT DEFAULT 'custom' NOT NULL,
	created_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_security_groups_workspace_slug UNIQUE (workspace_id, slug),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS share_snapshots (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	channel_name TEXT NOT NULL,
	title TEXT,
	created_by TEXT NOT NULL,
	snapshot_data JSONB NOT NULL,
	share_token TEXT NOT NULL,
	message_count INTEGER NOT NULL,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	UNIQUE (share_token)
);


CREATE TABLE IF NOT EXISTS timers (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	channel_name TEXT NOT NULL,
	thread_id TEXT,
	created_by TEXT NOT NULL,
	message TEXT NOT NULL,
	delay_seconds INTEGER NOT NULL,
	fires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS todos (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	channel_name TEXT NOT NULL,
	thread_id TEXT,
	created_by TEXT NOT NULL,
	assignee TEXT NOT NULL,
	content TEXT NOT NULL,
	status TEXT NOT NULL,
	position INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS workflow_runs (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	workflow_id TEXT,
	channel_name TEXT NOT NULL,
	snapshot JSONB NOT NULL,
	current_step TEXT,
	iterations INTEGER DEFAULT '0' NOT NULL,
	status TEXT DEFAULT 'running' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS workflows (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	name TEXT NOT NULL,
	description TEXT DEFAULT '' NOT NULL,
	steps JSONB NOT NULL,
	max_iterations INTEGER DEFAULT '5' NOT NULL,
	created_by TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS workspace_collaborators (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	email TEXT NOT NULL,
	role TEXT,
	added_by TEXT,
	added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	display_name TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_collaborator_workspace_email UNIQUE (workspace_id, email),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS workspace_invites (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	token TEXT NOT NULL,
	email TEXT,
	role TEXT DEFAULT 'member' NOT NULL,
	created_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	accepted_at TIMESTAMP WITH TIME ZONE,
	accepted_by TEXT,
	revoked_at TIMESTAMP WITH TIME ZONE,
	target_kind TEXT,
	target_id TEXT,
	note TEXT,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	UNIQUE (token)
);


CREATE TABLE IF NOT EXISTS workspace_memberships (
	workspace_id UUID NOT NULL,
	user_id UUID NOT NULL,
	role TEXT DEFAULT 'member' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (workspace_id, user_id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS browser_tabs (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	url TEXT NOT NULL,
	title TEXT,
	status TEXT NOT NULL,
	created_by TEXT NOT NULL,
	shared_with JSONB,
	artifact_channels JSONB DEFAULT '[]' NOT NULL,
	context_id TEXT,
	session_id TEXT,
	live_url TEXT,
	control_owner TEXT,
	control_token TEXT,
	control_expires_at TIMESTAMP WITH TIME ZONE,
	bf_key_source TEXT,
	bf_key_fingerprint TEXT,
	session_closed BOOLEAN DEFAULT FALSE NOT NULL,
	close_status TEXT DEFAULT 'none' NOT NULL,
	close_attempts INTEGER DEFAULT 0 NOT NULL,
	last_close_attempt_at TIMESTAMP WITH TIME ZONE,
	last_close_error TEXT,
	last_error TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(context_id) REFERENCES browser_contexts (id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS channels (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	name TEXT NOT NULL,
	service_id TEXT,
	icon TEXT,
	pinned_artifact JSONB,
	title TEXT,
	title_manually_set BOOLEAN DEFAULT FALSE,
	created_by TEXT,
	master_agent TEXT,
	resume_from TEXT,
	orchestration_mode TEXT DEFAULT 'dynamic' NOT NULL,
	response_mode TEXT DEFAULT 'proactive' NOT NULL,
	orchestration_instruction TEXT,
	workflow_id TEXT,
	status TEXT,
	is_channel BOOLEAN DEFAULT FALSE NOT NULL,
	starred BOOLEAN DEFAULT FALSE,
	last_event_at BIGINT,
	visibility TEXT DEFAULT 'public' NOT NULL,
	owner_email TEXT,
	participants_can_invite BOOLEAN DEFAULT FALSE NOT NULL,
	members_can_add_agents BOOLEAN DEFAULT TRUE NOT NULL,
	director_email TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(service_id) REFERENCES agent_services (id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS direct_thread_preferences (
	thread_id UUID NOT NULL,
	user_email TEXT NOT NULL,
	pinned BOOLEAN DEFAULT FALSE NOT NULL,
	starred BOOLEAN DEFAULT FALSE NOT NULL,
	PRIMARY KEY (thread_id, user_email),
	FOREIGN KEY(thread_id) REFERENCES direct_thread_links (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS issue_agent_sharing (
	issue_id TEXT NOT NULL,
	owner_email TEXT NOT NULL,
	mode TEXT DEFAULT 'no' NOT NULL,
	PRIMARY KEY (issue_id, owner_email),
	FOREIGN KEY(issue_id) REFERENCES issues (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS issue_comments (
	id TEXT NOT NULL,
	issue_id TEXT NOT NULL,
	author TEXT NOT NULL,
	author_name TEXT,
	content TEXT NOT NULL,
	kind TEXT DEFAULT 'comment' NOT NULL,
	source_event_id TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_issue_comment_event UNIQUE (issue_id, source_event_id),
	FOREIGN KEY(issue_id) REFERENCES issues (id) ON DELETE CASCADE,
	FOREIGN KEY(source_event_id) REFERENCES events (id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS kanban_tasks (
	id TEXT NOT NULL,
	issue_id TEXT,
	workspace_id UUID NOT NULL,
	title TEXT NOT NULL,
	description TEXT DEFAULT '' NOT NULL,
	status TEXT DEFAULT 'backlog' NOT NULL,
	assignee TEXT,
	workflow_id TEXT,
	created_by TEXT NOT NULL,
	channel_name TEXT,
	priority TEXT DEFAULT 'normal' NOT NULL,
	position INTEGER DEFAULT '0' NOT NULL,
	knowledge_ids JSONB,
	file_ids JSONB,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(issue_id) REFERENCES issues (id) ON DELETE SET NULL,
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS node_commands (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	node_id UUID NOT NULL,
	workspace_id UUID NOT NULL,
	action TEXT NOT NULL,
	command JSONB,
	status TEXT,
	result JSONB,
	created_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	delivered_at TIMESTAMP WITH TIME ZONE,
	finished_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(node_id) REFERENCES nodes (id) ON DELETE CASCADE,
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS project_preview_tickets (
	id TEXT NOT NULL,
	file_id TEXT NOT NULL,
	storage_key TEXT NOT NULL,
	principal JSONB NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(file_id) REFERENCES files (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS security_group_members (
	group_id TEXT NOT NULL,
	principal_kind TEXT NOT NULL,
	principal_id TEXT NOT NULL,
	added_by TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (group_id, principal_kind, principal_id),
	FOREIGN KEY(group_id) REFERENCES security_groups (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS workspace_members (
	workspace_id UUID NOT NULL,
	agent_name TEXT NOT NULL,
	display_name TEXT,
	role TEXT,
	agent_type TEXT,
	server_host TEXT,
	node_id UUID,
	working_dir TEXT,
	description TEXT,
	enabled_skills JSONB,
	model TEXT,
	status TEXT,
	last_heartbeat TIMESTAMP WITH TIME ZONE,
	joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	session_id TEXT,
	session_started_at TIMESTAMP WITH TIME ZONE,
	owner_email TEXT,
	visibility TEXT DEFAULT 'personal' NOT NULL,
	purpose TEXT,
	example_requests JSONB,
	required_inputs TEXT,
	shared_instructions TEXT,
	allowed_knowledge JSONB,
	cost_owner TEXT,
	request_approver_email TEXT,
	presence_state TEXT,
	busy_channels JSONB,
	queue_depth INTEGER DEFAULT 0 NOT NULL,
	PRIMARY KEY (workspace_id, agent_name),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(node_id) REFERENCES nodes (id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS channel_agent_sharing (
	channel_id UUID NOT NULL,
	owner_email TEXT NOT NULL,
	enabled BOOLEAN DEFAULT FALSE NOT NULL,
	mode TEXT DEFAULT 'no' NOT NULL,
	PRIMARY KEY (channel_id, owner_email),
	FOREIGN KEY(channel_id) REFERENCES channels (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS channel_human_members (
	channel_id UUID NOT NULL,
	user_email TEXT NOT NULL,
	joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (channel_id, user_email),
	FOREIGN KEY(channel_id) REFERENCES channels (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS channel_members (
	channel_id UUID NOT NULL,
	agent_name TEXT NOT NULL,
	PRIMARY KEY (channel_id, agent_name),
	FOREIGN KEY(channel_id) REFERENCES channels (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS issue_threads (
	issue_id TEXT NOT NULL,
	channel_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (issue_id, channel_id),
	FOREIGN KEY(issue_id) REFERENCES issues (id) ON DELETE CASCADE,
	FOREIGN KEY(channel_id) REFERENCES channels (id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS local_file_requests (
	id TEXT NOT NULL,
	workspace_id UUID NOT NULL,
	idempotency_key TEXT NOT NULL,
	requester_agent_id TEXT NOT NULL,
	requester_device_id UUID NOT NULL,
	requester_device_name TEXT NOT NULL,
	recipient_agent_id TEXT NOT NULL,
	recipient_device_id UUID NOT NULL,
	recipient_device_name TEXT NOT NULL,
	channel_name TEXT NOT NULL,
	root_id TEXT NOT NULL,
	relative_path TEXT NOT NULL,
	request_content_redacted TEXT NOT NULL,
	status TEXT DEFAULT 'queued_inspection' NOT NULL,
	sensitivity_reasons JSONB DEFAULT '[]' NOT NULL,
	sensitivity_stage TEXT,
	content_sha256 TEXT,
	content_size INTEGER,
	content_type TEXT,
	filename TEXT,
	approval_id TEXT,
	current_command_id UUID,
	file_id TEXT,
	error_code TEXT,
	error_message TEXT,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_local_file_request_idempotency UNIQUE (workspace_id, requester_agent_id, requester_device_id, idempotency_key),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(requester_device_id) REFERENCES nodes (id) ON DELETE CASCADE,
	FOREIGN KEY(recipient_device_id) REFERENCES nodes (id) ON DELETE CASCADE,
	UNIQUE (approval_id),
	FOREIGN KEY(approval_id) REFERENCES approvals (id) ON DELETE SET NULL,
	FOREIGN KEY(current_command_id) REFERENCES node_commands (id) ON DELETE SET NULL,
	UNIQUE (file_id),
	FOREIGN KEY(file_id) REFERENCES files (id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS thread_pins (
	channel_id UUID NOT NULL,
	user_email TEXT NOT NULL,
	PRIMARY KEY (channel_id, user_email),
	FOREIGN KEY(channel_id) REFERENCES channels (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_channel_latest ON events (network_id, target, timestamp DESC, id DESC) WHERE target LIKE 'channel/%%';
CREATE INDEX IF NOT EXISTS idx_events_network_target ON events (network_id, target);
CREATE INDEX IF NOT EXISTS idx_events_network_timestamp ON events (network_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_network_type ON events (network_id, type);
CREATE INDEX IF NOT EXISTS idx_events_network_type_target_ts ON events (network_id, type, target, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_poll_control ON events (network_id, timestamp DESC, id DESC) WHERE type LIKE 'workspace.agent.control%%';
CREATE INDEX IF NOT EXISTS idx_events_poll_message ON events (network_id, timestamp DESC, id DESC) WHERE type LIKE 'workspace.message.posted%%';
CREATE INDEX IF NOT EXISTS idx_events_poll_tool_result ON events (network_id, timestamp DESC, id DESC) WHERE type LIKE 'workspace.tool_result%%';

CREATE INDEX IF NOT EXISTS idx_agent_grants_agent ON agent_grants (workspace_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_grants_grantee ON agent_grants (workspace_id, grantee_email);

CREATE INDEX IF NOT EXISTS idx_agent_services_workspace ON agent_services (workspace_id);

CREATE INDEX IF NOT EXISTS idx_agent_watches_status_expiry ON agent_watches (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_watches_ws_status ON agent_watches (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_approvals_workspace_channel ON approvals (workspace_id, channel_name);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status ON approvals (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_browser_contexts_workspace_status ON browser_contexts (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_browser_usage_opened_by ON browser_usage (opened_by);
CREATE INDEX IF NOT EXISTS idx_browser_usage_started ON browser_usage (started_at);
CREATE INDEX IF NOT EXISTS idx_browser_usage_workspace ON browser_usage (workspace_id);

CREATE INDEX IF NOT EXISTS ix_campaign_grants_user_id ON campaign_grants (user_id);

CREATE INDEX IF NOT EXISTS idx_cloud_agent_workspace ON cloud_agent_configs (workspace_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_workspace ON device_tokens (workspace_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_workspace_user ON device_tokens (workspace_id, user_email);

CREATE INDEX IF NOT EXISTS idx_files_trash ON files (workspace_id, trash_id);
CREATE INDEX IF NOT EXISTS idx_files_workspace_status ON files (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_integration_bindings_team ON integration_bindings (external_team_id);
CREATE INDEX IF NOT EXISTS idx_integration_bindings_workspace ON integration_bindings (workspace_id);

CREATE INDEX IF NOT EXISTS idx_issues_workspace_status ON issues (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_knowledge_workspace_status ON knowledge_entries (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_pairing_workspace ON node_pairing_codes (workspace_id);

CREATE INDEX IF NOT EXISTS idx_nodes_workspace ON nodes (workspace_id);
CREATE INDEX IF NOT EXISTS ix_nodes_owner_email ON nodes (owner_email);
CREATE UNIQUE INDEX IF NOT EXISTS ix_nodes_token ON nodes (token);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (workspace_id, recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_read ON notifications (workspace_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_status ON notifications (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_resource_grants_grantee ON resource_grants (workspace_id, grantee_kind, grantee_id);
CREATE INDEX IF NOT EXISTS idx_resource_grants_resource ON resource_grants (workspace_id, resource_kind, resource_id);

CREATE INDEX IF NOT EXISTS idx_routines_next_fires_status ON routines (next_fires_at, status);
CREATE INDEX IF NOT EXISTS idx_routines_workspace_channel ON routines (workspace_id, channel_name);

CREATE INDEX IF NOT EXISTS idx_security_groups_workspace ON security_groups (workspace_id);

CREATE INDEX IF NOT EXISTS idx_share_snapshots_token ON share_snapshots (share_token);
CREATE INDEX IF NOT EXISTS idx_share_snapshots_workspace ON share_snapshots (workspace_id);

CREATE INDEX IF NOT EXISTS idx_timers_fires_at_status ON timers (fires_at, status);
CREATE INDEX IF NOT EXISTS idx_timers_workspace_channel ON timers (workspace_id, channel_name);

CREATE INDEX IF NOT EXISTS idx_todos_workspace_channel ON todos (workspace_id, channel_name);
CREATE INDEX IF NOT EXISTS idx_todos_workspace_created_by ON todos (workspace_id, created_by);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_ws_channel ON workflow_runs (workspace_id, channel_name);

CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows (workspace_id);

CREATE INDEX IF NOT EXISTS idx_collaborators_email ON workspace_collaborators (email);
CREATE INDEX IF NOT EXISTS idx_collaborators_workspace ON workspace_collaborators (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites (workspace_id);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON workspace_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_browser_tabs_workspace_status ON browser_tabs (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_channels_status_last_event ON channels (status, last_event_at);
CREATE INDEX IF NOT EXISTS idx_channels_workspace_status ON channels (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_channels_workspace_visibility ON channels (workspace_id, visibility);
CREATE UNIQUE INDEX IF NOT EXISTS uq_channels_ws_name ON channels (workspace_id, name);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_created ON issue_comments (issue_id, created_at);

CREATE INDEX IF NOT EXISTS idx_kanban_workspace_channel ON kanban_tasks (workspace_id, channel_name);
CREATE INDEX IF NOT EXISTS idx_kanban_workspace_status ON kanban_tasks (workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_kanban_tasks_issue_id ON kanban_tasks (issue_id);

CREATE INDEX IF NOT EXISTS idx_node_commands_node_status ON node_commands (node_id, status);

CREATE INDEX IF NOT EXISTS ix_project_preview_tickets_expires_at ON project_preview_tickets (expires_at);

CREATE INDEX IF NOT EXISTS idx_security_group_members_principal ON security_group_members (principal_kind, principal_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_owner ON workspace_members (workspace_id, owner_email);

CREATE INDEX IF NOT EXISTS idx_channel_human_members_email ON channel_human_members (user_email);

CREATE INDEX IF NOT EXISTS idx_local_file_requests_recipient_status ON local_file_requests (recipient_device_id, status);
CREATE INDEX IF NOT EXISTS idx_local_file_requests_requester ON local_file_requests (workspace_id, requester_agent_id, created_at);

CREATE TABLE IF NOT EXISTS controller_devices (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	device_key TEXT NOT NULL,
	kind TEXT NOT NULL,
	platform TEXT NOT NULL,
	display_name TEXT,
	upstream_user_id UUID,
	standalone_label TEXT,
	identity_mode TEXT NOT NULL,
	status TEXT DEFAULT 'active' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	last_seen_at TIMESTAMP WITH TIME ZONE,
	revoked_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_controller_device_workspace_key UNIQUE (workspace_id, device_key),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(upstream_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS controller_credentials (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	device_id UUID NOT NULL,
	workspace_id UUID NOT NULL,
	family_id TEXT NOT NULL,
	generation INTEGER NOT NULL,
	access_token_hash TEXT NOT NULL,
	refresh_token_hash TEXT NOT NULL,
	scopes JSONB NOT NULL,
	access_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	refresh_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	revoked_at TIMESTAMP WITH TIME ZONE,
	revoke_reason TEXT,
	replaced_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_controller_access_hash UNIQUE (access_token_hash),
	CONSTRAINT uq_controller_refresh_hash UNIQUE (refresh_token_hash),
	FOREIGN KEY(device_id) REFERENCES controller_devices (id) ON DELETE CASCADE,
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_principal_bindings (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	agent_name TEXT NOT NULL,
	node_id UUID NOT NULL,
	status TEXT DEFAULT 'active' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	revoked_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_agent_principal_binding UNIQUE (workspace_id, agent_name, node_id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(node_id) REFERENCES nodes (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS identity_audit_events (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	action TEXT NOT NULL,
	principal_kind TEXT NOT NULL,
	device_id UUID,
	reason TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS identity_stream_tickets (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	workspace_id UUID NOT NULL,
	device_id UUID NOT NULL,
	ticket_hash TEXT NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	used_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	PRIMARY KEY (id),
	CONSTRAINT uq_identity_stream_ticket_hash UNIQUE (ticket_hash),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(device_id) REFERENCES controller_devices (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_controller_devices_workspace ON controller_devices (workspace_id);
CREATE INDEX IF NOT EXISTS idx_controller_devices_status ON controller_devices (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_controller_credentials_device ON controller_credentials (device_id);
CREATE INDEX IF NOT EXISTS idx_controller_credentials_family ON controller_credentials (family_id);
CREATE INDEX IF NOT EXISTS idx_agent_principal_bindings_workspace ON agent_principal_bindings (workspace_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_identity_audit_workspace ON identity_audit_events (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_identity_stream_tickets_device ON identity_stream_tickets (device_id);

CREATE TABLE IF NOT EXISTS alembic_version (
    version_num varchar(32) NOT NULL PRIMARY KEY
);
INSERT INTO alembic_version (version_num)
SELECT '085' WHERE NOT EXISTS (SELECT 1 FROM alembic_version);
