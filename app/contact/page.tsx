"use client";

import { useContext, useState } from "react";
import { Helmet } from "react-helmet-async";
// import { Mail, Phone, MapPin } from "lucide-react";
import {
  SiFacebook,
  SiInstagram,
  SiLinkedin,
  SiPinterest,
  SiX,
} from "@icons-pack/react-simple-icons";
import { ConfigContext } from "@/app/wrapper";
import { RedBubble } from "@/app/components/Icons/RedBubble";
import { TeePublic } from "@/app/components/Icons/TeePublic";
import { TostaDora } from "@/app/components/Icons/TostaDora";

export default function Contact() {
  const config = useContext(ConfigContext);
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
    <>
      <Helmet>
        <title>Contact Us - {config.name}</title>
        <meta
          name="description"
          content={`Contact ${config.name}&#39;s journey, our passionate team, and our innovative approach to thread-based design.`}
        />
        <meta
          name="keywords"
          content={`${config.name}, contact us, ${config.keywords}`}
        />
      </Helmet>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8 text-[#212A31]">Contact Us</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
              Get in Touch
            </h2>
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
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
              Connect With Us
            </h2>
            <div className="flex justify-left space-x-4">
              {config.social.facebook && (
                <a
                  href={config.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <SiFacebook size={24} />
                  <span className="sr-only">Facebook</span>
                </a>
              )}
              {config.social.twitter && (
                <a
                  href={config.social.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <SiX size={24} />
                  <span className="sr-only">Twitter</span>
                </a>
              )}
              {config.social.instagram && (
                <a
                  href={config.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <SiInstagram size={24} />
                  <span className="sr-only">Instagram</span>
                </a>
              )}
              {config.social.linkedin && (
                <a
                  href={config.social.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <SiLinkedin size={24} />
                  <span className="sr-only">LinkedIn</span>
                </a>
              )}
              {config.social.pinterest && (
                <a
                  href={config.social.pinterest}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <SiPinterest size={24} />
                  <span className="sr-only">Pinterest</span>
                </a>
              )}
            </div>
            <h2 className="text-2xl font-semibold mb-4 mt-3 text-[#212A31]">
              Our Shops
            </h2>
            <div className="flex justify-left space-x-4">
              {config.representation.redbuble && (
                <a
                  href={config.representation.redbuble}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <RedBubble size={24} color="#748D92" />
                  <span className="sr-only">Redbuble</span>
                </a>
              )}
              {config.representation.teepublic && (
                <a
                  href={config.representation.teepublic}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <TeePublic size={24} />
                  <span className="sr-only">Teepublic</span>
                </a>
              )}
              {config.representation.tostadora && (
                <a
                  href={config.representation.tostadora}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#124e66] transition-colors"
                >
                  <TostaDora size={24} />
                  <span className="sr-only">Tostadora</span>
                </a>
              )}
            </div>
            {/*<div className="space-y-4">*/}
            {/*  <div className="flex items-center text-[#212A31]">*/}
            {/*    <Mail className="mr-2" size={20}/>*/}
            {/*    <span>{companyData.email}</span>*/}
            {/*  </div>*/}
            {/*  <div className="flex items-center text-[#212A31]">*/}
            {/*    <Phone className="mr-2" size={20}/>*/}
            {/*    <span>{companyData.phone}</span>*/}
            {/*  </div>*/}
            {/*  <div className="flex items-center text-[#212A31]">*/}
            {/*    <MapPin className="mr-2" size={20}/>*/}
            {/*    <span>123 Design Street, Creativity City, TC 12345</span>*/}
            {/*  </div>*/}
            {/*</div>*/}
          </div>
        </div>
      </div>
    </>
  );
}
