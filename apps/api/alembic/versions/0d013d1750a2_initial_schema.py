"""initial_schema"""
from alembic import op
import sqlalchemy as sa

revision = '0d013d1750a2'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():

    op.create_table('admin_users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('session_version', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )
    op.create_table('events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('start_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('venue', sa.String(length=500), nullable=False),
    sa.Column('counters', sa.JSON(), nullable=False),
    sa.Column('max_companions', sa.Integer(), nullable=False),
    sa.Column('pg_access_code_hash', sa.String(length=255), nullable=False),
    sa.Column('welcome_screen_token', sa.String(length=128), nullable=False),
    sa.Column('session_version', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('id = 1', name='single_event'),
    sa.CheckConstraint('max_companions >= 0', name='event_companions_nonnegative'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('welcome_screen_token')
    )
    op.create_table('outbox',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('event_type', sa.String(length=30), nullable=False),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_outbox_published_at'), 'outbox', ['published_at'], unique=False)
    op.create_table('guests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('event_id', sa.Integer(), nullable=False),
    sa.Column('invite_token', sa.String(length=128), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('company', sa.String(length=250), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=True),
    sa.Column('phone', sa.String(length=40), nullable=False),
    sa.Column('rsvp_status', sa.String(length=20), nullable=False),
    sa.Column('companions', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("rsvp_status = 'accepted' OR companions = 0", name='companions_require_accepted'),
    sa.CheckConstraint("rsvp_status IN ('pending', 'accepted', 'declined')", name='valid_rsvp'),
    sa.CheckConstraint('companions >= 0', name='companions_nonnegative'),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'email', name='uq_guest_event_email'),
    sa.UniqueConstraint('id', 'event_id', name='uq_guest_id_event')
    )
    op.create_index(op.f('ix_guests_event_id'), 'guests', ['event_id'], unique=False)
    op.create_index(op.f('ix_guests_invite_token'), 'guests', ['invite_token'], unique=True)
    op.create_index(op.f('ix_guests_name'), 'guests', ['name'], unique=False)
    op.create_index(op.f('ix_guests_rsvp_status'), 'guests', ['rsvp_status'], unique=False)
    op.create_table('checkins',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('event_id', sa.Integer(), nullable=False),
    sa.Column('guest_id', sa.Integer(), nullable=False),
    sa.Column('counter', sa.String(length=80), nullable=False),
    sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ),
    sa.ForeignKeyConstraint(['guest_id', 'event_id'], ['guests.id', 'guests.event_id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'guest_id', name='uq_checkin_event_guest')
    )
    op.create_index(op.f('ix_checkins_checked_in_at'), 'checkins', ['checked_in_at'], unique=False)
    op.create_index(op.f('ix_checkins_event_id'), 'checkins', ['event_id'], unique=False)
    op.create_index(op.f('ix_checkins_guest_id'), 'checkins', ['guest_id'], unique=False)


def downgrade():

    op.drop_index(op.f('ix_checkins_guest_id'), table_name='checkins')
    op.drop_index(op.f('ix_checkins_event_id'), table_name='checkins')
    op.drop_index(op.f('ix_checkins_checked_in_at'), table_name='checkins')
    op.drop_table('checkins')
    op.drop_index(op.f('ix_guests_rsvp_status'), table_name='guests')
    op.drop_index(op.f('ix_guests_name'), table_name='guests')
    op.drop_index(op.f('ix_guests_invite_token'), table_name='guests')
    op.drop_index(op.f('ix_guests_event_id'), table_name='guests')
    op.drop_table('guests')
    op.drop_index(op.f('ix_outbox_published_at'), table_name='outbox')
    op.drop_table('outbox')
    op.drop_table('events')
    op.drop_table('admin_users')

