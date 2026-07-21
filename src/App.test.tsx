import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/pour an ocean/i);
  expect(headingElement).toBeInTheDocument();
});
