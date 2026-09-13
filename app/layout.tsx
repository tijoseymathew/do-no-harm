import "@fontsource-variable/inter";
import "../client/src/styles.css";

export const metadata = {
  title: "DO NO HARM",
  description: "A clearly labeled formative clinical simulation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
