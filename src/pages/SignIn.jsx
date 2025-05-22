import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn } from "../lib/api";
import { Button, TextField, Card, CardContent, Typography } from "@mui/material";

export default function SignIn() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr]   = useState("");

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const res = await signIn(form);        // body = {email, password}
    if (res?.ok) nav("/home");
    else setErr("Invalid credentials");
  };

  return (
    <Card className="max-w-sm mx-auto mt-24 p-4">
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Sign In
        </Typography>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField label="Email"    name="email"    value={form.email}    onChange={handleChange} fullWidth />
          <TextField label="Password" name="password" type="password"
                     value={form.password} onChange={handleChange} fullWidth />
          {err && <Typography color="error">{err}</Typography>}
          <Button type="submit" variant="contained">Log in</Button>
        </form>
      </CardContent>
    </Card>
  );
}
