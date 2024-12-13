"use client";

import { useState } from "react";

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Here you would typically send the form data to your backend or a service like Formspree
    console.log("Form submitted:", formData);
    // Reset form after submission
    setFormData({ name: "", email: "", message: "" });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block mb-1 text-[#212A31]">
          Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-[#748D92] rounded-md focus:outline-none focus:ring-2 focus:ring-[#124E66]"
        />
      </div>
      <div>
        <label htmlFor="email" className="block mb-1 text-[#212A31]">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-[#748D92] rounded-md focus:outline-none focus:ring-2 focus:ring-[#124E66]"
        />
      </div>
      <div>
        <label htmlFor="message" className="block mb-1 text-[#212A31]">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          rows={4}
          className="w-full px-3 py-2 border border-[#748D92] rounded-md focus:outline-none focus:ring-2 focus:ring-[#124E66]"
        ></textarea>
      </div>
      <button
        type="submit"
        className="bg-[#124E66] text-[#D3D9D4] px-6 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
      >
        Send Message
      </button>
    </form>
  );
}
