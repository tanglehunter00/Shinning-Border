import { Button } from "./components/Button";
import "./App.css";

function App() {
  return (
    <main className="demo">
      <h1>Shining Button</h1>
      <div className="demo__row">
        <Button borderRadius={20} borderWidth={3} text="深色按钮" type="dark" />
        <Button borderRadius={20} borderWidth={3} text="浅色按钮" type="light" />
        <Button borderRadius={999} borderWidth={2} text="胶囊" type="dark" />
      </div>
    </main>
  );
}

export default App;
