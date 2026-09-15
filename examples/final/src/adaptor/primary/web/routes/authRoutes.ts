import type { Context, Hono } from "hono";
import { z } from "zod";

import type { Clock } from "../../../../domain/aggregate/clock.js";
import type {
  InstallationStatus,
  InstallationStatusQuery,
} from "../../../../domain/installation/installationStatusQuery.js";
import { PlaintextPassword } from "../../../../domain/user/plaintextPassword.js";
import { UserEmail } from "../../../../domain/user/userEmail.js";
import { UserName } from "../../../../domain/user/userName.js";
import type { LogInUseCase } from "../../../../useCase/logInUseCase.js";
import type { LogOutUseCase } from "../../../../useCase/logOutUseCase.js";
import type { SetUpInitialAdminUseCase } from "../../../../useCase/setUpInitialAdminUseCase.js";
import { resolveInstallationStatus } from "../installationStatus.js";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../middleware/authentication.js";
import { parseBody } from "../middleware/requestBody.js";
import { withSharedProps } from "../middleware/sharedProps.js";
import {
  assertNever,
  respondToUseCaseError,
} from "../middleware/useCaseResponse.js";
import type { WebEnvironment } from "../pageProps.js";

const SetupFormSchema = z.object({
  email: UserEmail.schema,
  name: UserName.schema,
  password: PlaintextPassword.schema,
});
const LoginFormSchema = z.object({
  email: UserEmail.schema,
  password: PlaintextPassword.schema,
});

type AuthRouteDependencies = Readonly<{
  installationStatusQuery: InstallationStatusQuery;
  setUpInitialAdmin: SetUpInitialAdminUseCase;
  logIn: LogInUseCase;
  logOut: LogOutUseCase;
  clock: Clock;
  isProduction: boolean;
}>;

const respondToSetupPage = (
  context: Context<WebEnvironment>,
  installation: InstallationStatus,
): Response => {
  switch (installation.kind) {
    case "Installed":
      return context.redirect(
        context.get("actor") === undefined ? "/login" : "/",
      );
    case "InitialSetupAvailable":
      return context.render("Setup", withSharedProps(context, {}));
    default:
      return assertNever(installation);
  }
};

const respondToLoginPage = (
  context: Context<WebEnvironment>,
  installation: InstallationStatus,
): Response => {
  switch (installation.kind) {
    case "InitialSetupAvailable":
      return context.redirect("/setup");
    case "Installed":
      return context.get("actor") === undefined
        ? context.render("Login", withSharedProps(context, {}))
        : context.redirect("/");
    default:
      return assertNever(installation);
  }
};

export const registerAuthRoutes = (
  app: Hono<WebEnvironment>,
  dependencies: AuthRouteDependencies,
): void => {
  app.get("/setup", async (context) => {
    const installation = await resolveInstallationStatus(
      dependencies.installationStatusQuery,
    );
    return respondToSetupPage(context, installation);
  });

  /** 最初の一人だけが Admin を登録できる。二人目は store が InitialAdminAlreadyExists を返す */
  app.post("/setup", async (context) => {
    const installation = await resolveInstallationStatus(
      dependencies.installationStatusQuery,
    );
    switch (installation.kind) {
      case "Installed":
        return context.redirect("/login");
      case "InitialSetupAvailable":
        break;
      default:
        return assertNever(installation);
    }

    return parseBody(context, SetupFormSchema).match(
      (input) =>
        dependencies.setUpInitialAdmin.run(input).match(
          (session) => {
            setSessionCookie(
              context,
              session,
              dependencies.clock,
              dependencies.isProduction,
            );
            return context.redirect("/");
          },
          (error) => {
            switch (error.kind) {
              case "InitialAdminAlreadyExists":
                return context.redirect("/login");
              case "PasswordHashingFailed":
              case "IdentityGenerationFailed":
              case "SessionCreationFailed":
                return respondToUseCaseError(context, {
                  kind: "InternalServerError",
                });
              default:
                return assertNever(error);
            }
          },
        ),
      (error) =>
        respondToUseCaseError(context, error, {
          validation: (errors) =>
            context.render(
              "Setup",
              withSharedProps(context, { errors }),
              { url: "/setup" },
            ),
        }),
    );
  });

  app.get("/login", async (context) => {
    const installation = await resolveInstallationStatus(
      dependencies.installationStatusQuery,
    );
    return respondToLoginPage(context, installation);
  });

  app.post("/login", async (context) => {
    const installation = await resolveInstallationStatus(
      dependencies.installationStatusQuery,
    );
    switch (installation.kind) {
      case "InitialSetupAvailable":
        return context.redirect("/setup");
      case "Installed":
        break;
      default:
        return assertNever(installation);
    }

    return parseBody(context, LoginFormSchema).match(
      (input) =>
        dependencies.logIn.run(input).match(
          (session) => {
            setSessionCookie(
              context,
              session,
              dependencies.clock,
              dependencies.isProduction,
            );
            return context.redirect("/");
          },
          (error) => {
            switch (error.kind) {
              case "InvalidCredentials":
                return context.render(
                  "Login",
                  withSharedProps(context, {
                    errors: {
                      credentials:
                        "メールアドレスまたはパスワードが正しくありません",
                    },
                  }),
                  { url: "/login" },
                );
              case "PasswordVerificationFailed":
              case "SessionCreationFailed":
                return respondToUseCaseError(context, {
                  kind: "InternalServerError",
                });
              default:
                return assertNever(error);
            }
          },
        ),
      (error) =>
        respondToUseCaseError(context, error, {
          validation: (errors) =>
            context.render(
              "Login",
              withSharedProps(context, { errors }),
              { url: "/login" },
            ),
        }),
    );
  });

  app.post("/logout", async (context) => {
    const actor = context.get("actor");
    if (actor === undefined) {
      const installation = await resolveInstallationStatus(
        dependencies.installationStatusQuery,
      );
      switch (installation.kind) {
        case "InitialSetupAvailable":
          return context.redirect("/setup");
        case "Installed":
          return context.redirect("/login");
        default:
          return assertNever(installation);
      }
    }

    return dependencies.logOut
      .run({
        actorUserId: actor.user.userId,
        sessionId: actor.session.sessionId,
      })
      .match(
        () => {
          clearSessionCookie(context, dependencies.isProduction);
          return context.redirect("/login");
        },
        (error) => {
          switch (error.kind) {
            case "SessionNotFound":
              clearSessionCookie(context, dependencies.isProduction);
              return context.redirect("/login");
            case "Unauthorized":
              return respondToUseCaseError(context, {
                kind: "Unauthorized",
              });
            case "SessionInvalidationFailed":
              return respondToUseCaseError(context, {
                kind: "InternalServerError",
              });
            default:
              return assertNever(error);
          }
        },
      );
  });
};
