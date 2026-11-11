import { render, screen } from "@testing-library/react";
import App from "./App";

test("shows the store name and points to the mockup", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Halden");
  expect(screen.getByText(/mockup\/index\.html/)).toBeInTheDocument();
});
