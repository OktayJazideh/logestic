import { AuditLogStore } from "./stores/auditLogStore";
import { OtpStore } from "./stores/otpStore";
import { SessionStore } from "./stores/sessionStore";
import { UserStore } from "./stores/userStore";
import { AuthService } from "./services/authService";
import { MineDataStore } from "./stores/mineDataStore";
import { MissionStore } from "./stores/missionStore";
import { FinanceStore } from "./stores/financeStore";
import { EntitiesStore } from "./stores/entitiesStore";

export const appContext = {
  otpStore: new OtpStore(),
  userStore: new UserStore(),
  sessionStore: new SessionStore(),
  auditStore: new AuditLogStore(),
  authService: null as unknown as AuthService,
  mineData: new MineDataStore(),
  entities: new EntitiesStore(),
  mission: null as unknown as MissionStore,
  finance: new FinanceStore(),
};

appContext.authService = new AuthService(
  appContext.otpStore,
  appContext.userStore,
  appContext.sessionStore,
);

appContext.mission = new MissionStore(appContext.entities, appContext.finance);

