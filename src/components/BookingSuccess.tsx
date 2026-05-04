import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Check, Clock, CreditCard, ArrowLeft, Phone, Mail } from "lucide-react";
import { motion } from "motion/react";

export default function BookingSuccess() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get("ref") || "—";
  const isPending = searchParams.get("pending") === "true";
  const isPaid = searchParams.get("paid") === "true";

  // isPaid = guest just paid via the approval payment link
  // isPending = guest just submitted a request (no payment yet)
  // neither = instant book confirmed

  const getContent = () => {
    if (isPaid) {
      return {
        icon: <Check className="text-forest" size={36} />,
        iconBg: "bg-forest/10",
        bar: "bg-forest",
        title: "Booking Confirmed",
        body: (
          <>
            <p className="mb-4">Dear guest,</p>
            <p className="text-muted">
              Your payment has been received and your stay at Anna's Stays is confirmed.
              We are so excited to welcome you to Helsinki!
            </p>
            <p className="mt-4 text-muted">
              You will receive your entry codes by email 24 hours before check-in.
            </p>
          </>
        ),
      };
    }
    if (isPending) {
      return {
        icon: <Clock className="text-clay" size={36} />,
        iconBg: "bg-clay/10",
        bar: "bg-clay",
        title: "Request Received",
        body: (
          <>
            <p className="mb-4">Dear guest,</p>
            <p className="text-muted">
              Thank you for your booking request. We will review it and get back to you by email shortly.
            </p>
            <p className="mt-4 text-muted">
              If approved, you will receive a <strong className="not-italic text-charcoal">secure payment link</strong> by email. No payment is required now.
            </p>
          </>
        ),
      };
    }
    // Instant book
    return {
      icon: <Check className="text-forest" size={36} />,
      iconBg: "bg-forest/10",
      bar: "bg-forest",
      title: "Booking Confirmed",
      body: (
        <>
          <p className="mb-4">Dear guest,</p>
          <p className="text-muted">
            Your payment has been received and your stay at Anna's Stays is confirmed.
            We are so excited to welcome you to Helsinki!
          </p>
          <p className="mt-4 text-muted">
            You will receive your entry codes by email 24 hours before check-in.
          </p>
        </>
      ),
    };
  };

  const content = getContent();

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-lg w-full"
      >
        <div className="bg-white border border-mist shadow-2xl p-10 md:p-14 relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-1 ${content.bar}`} />

          <div className="text-center mb-10">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${content.iconBg}`}>
              {content.icon}
            </div>
            <h1 className="font-serif text-3xl font-light mb-3">{content.title}</h1>
            <p className="text-[0.65rem] tracking-[0.2em] uppercase text-muted font-sans">
              Reference: <span className="text-charcoal font-bold">#{ref}</span>
            </p>
          </div>

          <div className="bg-cream/50 border border-mist/50 p-6 mb-8 font-serif italic leading-relaxed text-[1rem]">
            {content.body}
            <div className="mt-6 not-italic">
              <p className="font-cursive text-2xl text-clay">Anna Humalainen</p>
              <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans">Host</p>
            </div>
          </div>

          <div className="mb-8 p-5 border border-mist/30 bg-warm-white">
            <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans mb-4 text-center">Need help?</p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-10">
              <a href="mailto:info@anna-stays.fi" className="flex items-center gap-2 text-xs text-muted no-underline hover:text-charcoal transition-colors">
                <Mail size={14} className="text-clay" /> info@anna-stays.fi
              </a>
              <a href="https://wa.me/358442400228" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted no-underline hover:text-charcoal transition-colors">
                <Phone size={14} className="text-clay" /> +358 44 240 0228
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              to="/find-booking"
              className="w-full p-4 bg-charcoal text-white font-sans text-[0.7rem] tracking-[0.2em] uppercase text-center no-underline hover:bg-charcoal/90 transition-all"
            >
              Manage My Booking
            </Link>
            <Link
              to="/"
              className="w-full p-4 border border-mist text-charcoal font-sans text-[0.7rem] tracking-[0.2em] uppercase text-center no-underline hover:bg-cream transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} /> Back to Anna's Stays
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
