"""add guest notes

Revision ID: 9c8f1d7a2b40
Revises: 0d013d1750a2
"""
from alembic import op
import sqlalchemy as sa


revision = '9c8f1d7a2b40'
down_revision = '0d013d1750a2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('guests', sa.Column('notes', sa.String(length=1000), server_default='', nullable=False))


def downgrade():
    op.drop_column('guests', 'notes')
