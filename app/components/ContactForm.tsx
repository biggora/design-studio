"use client";

import { useState } from "react";
import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Status = "idle" | "submitting" | "success" | "not_configured" | "error";

export default function ContactForm() {
  const config = useContext(ConfigContext);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState<Status>("idle");

  const studioEmail = (config?.email || "").trim();
  const mailtoHref = studioEmail
    ? `mailto:${studioEmail}?subject=${encodeURIComponent(
        `Message from ${formData.name || "the website"}`
      )}`
    : "";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setFormData({ name: "", email: "", message: "" });
        setStatus("success");
      } else if (response.status === 501) {
        setStatus("not_configured");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const directEmailLine = mailtoHref ? (
    <>
      {" "}
      <a href={mailtoHref} className="underline text-accent">
        email us directly
      </a>
      .
    </>
  ) : (
    "."
  );

  return (
    <div>
      <div aria-live="polite">
        {status === "success" && (
          <div className="mb-4 p-4 text-green-800 bg-green-100 rounded-md">
            Message sent. We&apos;ll get back to you soon.
          </div>
        )}
        {status === "not_configured" && (
          <div className="mb-4 p-4 text-foreground bg-muted rounded-md">
            Message sending isn&apos;t set up on this site yet. Please
            {directEmailLine}
          </div>
        )}
        {status === "error" && (
          <div className="mb-4 p-4 text-red-800 bg-red-100 rounded-md">
            Message failed to send. Please try again, or{directEmailLine}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block mb-1 text-foreground">
            Name
          </label>
          <Input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="block mb-1 text-foreground">
            Email
          </label>
          <Input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="message" className="block mb-1 text-foreground">
            Message
          </label>
          <Textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            rows={4}
          />
        </div>
        <Button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending…" : "Send Message"}
        </Button>
      </form>
    </div>
  );
}
