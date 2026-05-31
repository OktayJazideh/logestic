-- REDISPATCH-1: terminal CANCELLED status for emergency re-dispatch
ALTER TYPE "MissionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
