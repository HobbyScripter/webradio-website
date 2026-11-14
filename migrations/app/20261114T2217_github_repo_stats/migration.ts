#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/05013c21e484e53976d1e87bab62e7714d631e06d5048d7ac4d4d97117d070c2/contract';
import endContract from '../../snapshots/05013c21e484e53976d1e87bab62e7714d631e06d5048d7ac4d4d97117d070c2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a61918f0b1c8b54dbf33affc080620281580b3acf90ea9097df5e2db7a28c21a/contract';
import startContract from '../../snapshots/a61918f0b1c8b54dbf33affc080620281580b3acf90ea9097df5e2db7a28c21a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'GitHubCodeFrequencyWeek',
        columns: [
          col('additions', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deletions', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('weekStart', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubCommitActivityWeek',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('daysJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('total', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('weekStart', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubContributorSnapshot',
        columns: [
          col('capturedFor', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('contributions', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('login', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubParticipationWeek',
        columns: [
          col('allCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('weekStart', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubPunchCardSlot',
        columns: [
          col('count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('hour', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('weekday', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubRepoStatsSnapshot',
        columns: [
          col('capturedFor', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('forks', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('language', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('license', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('openIssues', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('stars', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('topics', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('watchers', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubCodeFrequencyWeek',
        constraint: 'GitHubCodeFrequencyWeek_weekStart_key',
        columns: ['weekStart'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubCommitActivityWeek',
        constraint: 'GitHubCommitActivityWeek_weekStart_key',
        columns: ['weekStart'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubContributorSnapshot',
        constraint: 'GitHubContributorSnapshot_capturedFor_login_key',
        columns: ['capturedFor', 'login'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubParticipationWeek',
        constraint: 'GitHubParticipationWeek_weekStart_key',
        columns: ['weekStart'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubPunchCardSlot',
        constraint: 'GitHubPunchCardSlot_weekday_hour_key',
        columns: ['weekday', 'hour'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubRepoStatsSnapshot',
        constraint: 'GitHubRepoStatsSnapshot_capturedFor_key',
        columns: ['capturedFor'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
