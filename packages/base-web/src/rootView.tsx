import { serializePage, type PageObject, type RootView } from "@hono/inertia";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const reactRefreshPreamble = `import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`;

const Document = ({
  developmentClientSource,
  isProduction,
  page,
  title,
}: Readonly<{
  developmentClientSource: string;
  isProduction: boolean;
  page: PageObject;
  title: string;
}>): ReactElement => {
  const clientSource = isProduction
    ? "/static/client.js"
    : developmentClientSource;

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {isProduction ? (
          <link rel="stylesheet" href="/static/styles.css" />
        ) : (
          <script type="module">{reactRefreshPreamble}</script>
        )}
        <script type="module" src={clientSource} />
      </head>
      <body>
        <script
          data-page="app"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: serializePage(page) }}
        />
        <div id="app" />
      </body>
    </html>
  );
};

export const createClinicRootView = (
  isProduction: boolean,
  developmentClientSource = "/src/web/client.tsx",
  title = "関数型どうぶつ病院",
): RootView =>
  async (page, context) => {
    const html = `<!DOCTYPE html>${renderToStaticMarkup(
      <Document
        developmentClientSource={developmentClientSource}
        isProduction={isProduction}
        page={page}
        title={title}
      />,
    )}`;
    const vite = context.env?.vite;

    if (isProduction || vite === undefined) {
      return html;
    }

    return vite.transformIndexHtml(context.req.path, html);
  };

/** MoonBase 日の出基地の参照実装で使う root view。タイトルだけが違う */
export const createMoonbaseRootView = (
  isProduction: boolean,
  developmentClientSource = "/src/web/client.tsx",
): RootView =>
  createClinicRootView(isProduction, developmentClientSource, "MoonBase 日の出基地");
