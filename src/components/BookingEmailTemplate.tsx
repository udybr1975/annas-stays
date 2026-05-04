import { Phone, Mail, MapPin, Calendar, Users, CreditCard, ExternalLink } from "lucide-react";
import { resolveImageUrl } from "../lib/imageUtils";

interface BookingEmailTemplateProps {
  booking: any;
  listing: any;
  guest: any;
  onClose?: () => void;
  isPrintView?: boolean;
}

export default function BookingEmailTemplate({ booking, listing, guest, onClose, isPrintView = false }: BookingEmailTemplateProps) {
  const nights = booking.check_in && booking.check_out 
    ? Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const manageUrl = `${window.location.origin}/manage-booking/${booking.id}`;

  return (
    <div className={`bg-warm-white min-h-screen ${isPrintView ? "" : "p-4 md:p-10"} font-sans text-charcoal`}>
      <div className="max-w-[700px] mx-auto bg-white shadow-xl border border-mist overflow-hidden relative">
        {onClose && !isPrintView && (
          <button onClick={onClose} className="absolute top-4 right-4 z-10 bg-white/80 p-2 rounded-full hover:bg-white transition-colors">
            <span className="sr-only">Close</span>
            <span className="text-xl">✕</span>
          </button>
        )}

        {/* Header Image */}
        <div className="h-[250px] relative overflow-hidden">
          <img
            src={resolveImageUrl(listing?.imgs?.[0])}
            alt={listing?.name ?? ''}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 to-transparent flex items-end p-8">
            <div>
              <p className="text-[0.65rem] tracking-[0.3em] uppercase text-birch mb-1 font-sans">Your Itinerary</p>
              <h1 className="font-serif text-3xl md:text-4xl text-white font-light">{listing?.name}</h1>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-12">
          {/* Welcome Note */}
          <div className="bg-[#FAF9F6] p-8 border border-mist/50 shadow-sm mb-10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-clay/20" />
            <p className="font-serif text-xl italic text-charcoal mb-6 leading-relaxed">
              Dear {guest?.first_name},
            </p>
            <p className="font-serif text-[1.05rem] text-muted leading-loose mb-8 italic">
              {booking.status === 'pending' ? (
                <>
                  Thank you for your interest in <span className="text-charcoal font-medium not-italic">{listing?.name}</span>.
                  This property requires host approval to ensure the best possible experience for our guests. 
                  We have received your request for <span className="text-charcoal font-medium not-italic">{booking.check_in}</span> to <span className="text-charcoal font-medium not-italic">{booking.check_out}</span> and are currently reviewing it. 
                  We appreciate your patience and will notify you as soon as the status is updated.
                </>
              ) : (
                <>
                  {booking.guest_count === 2
                    ? "I'm so glad both of you chose my studio for your stay."
                    : "I am so thrilled you'll be staying with us at "
                  }
                  <span className="text-charcoal font-medium not-italic">{listing?.name}</span>.
                  Helsinki is a magical city, and we've prepared everything to make your visit truly special. 
                  We'll send your personal entry codes 24 hours before you arrive.
                </>
              )}
            </p>
            <div className="mt-4">
              <p className="font-cursive text-3xl text-clay mb-0.5">Anna Humalainen</p>
              <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans">Host</p>
            </div>
          </div>

          {/* Booking Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div>
              <h3 className="text-[0.65rem] tracking-[0.2em] uppercase text-muted font-sans font-bold mb-4 border-b border-mist pb-2">Stay Details</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="text-clay shrink-0 mt-0.5" size={16} />
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Dates</p>
                    <p className="text-sm font-serif">{booking.check_in} — {booking.check_out}</p>
                    <p className="text-[0.65rem] text-clay italic">{nights} Nights Stay</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="text-clay shrink-0 mt-0.5" size={16} />
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Guests</p>
                    <p className="text-sm font-serif">{booking.guest_count} {booking.guest_count === 1 ? "Guest" : "Guests"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="text-clay shrink-0 mt-0.5" size={16} />
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Location</p>
                    <p className="text-sm font-serif">{listing?.neigh ? `${listing.neigh}, Helsinki` : 'Helsinki'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[0.65rem] tracking-[0.2em] uppercase text-muted font-sans font-bold mb-4 border-b border-mist pb-2">Reservation</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="text-clay shrink-0 mt-0.5 font-bold text-xs">#</div>
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Reference</p>
                    <p className="text-sm font-mono font-bold text-charcoal">{booking.reference_number || `RES-${booking.id?.slice(0, 8).toUpperCase()}`}</p>
                  </div>
                </div>
                {booking.status !== 'pending' && (
                  <div className="flex items-start gap-3">
                    <CreditCard className="text-clay shrink-0 mt-0.5" size={16} />
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Total Paid</p>
                      <p className="text-lg font-serif text-forest">€{booking.total_price}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Manage Instruction */}
          <div className="text-center mb-12 p-6 bg-cream/30 border border-mist/30">
            <p className="text-[0.75rem] text-charcoal font-sans leading-relaxed">
              To manage your booking, please visit the main page of <span className="font-medium text-clay">Anna's Stays</span> and click on the <span className="font-medium text-clay uppercase tracking-wider">Find My Booking</span> tab.
            </p>
          </div>

          {/* Refund Policy */}
          {booking.status !== 'pending' && (
            <div className="border-t border-mist pt-8 mb-10">
              <h3 className="text-[0.65rem] tracking-[0.2em] uppercase text-charcoal font-sans font-bold mb-4">Refund Policy</h3>
              <div className="bg-cream/50 p-5 text-[0.75rem] text-muted leading-relaxed font-light italic">
                <p className="mb-2">Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.</p>
                <p>To initiate a cancellation, please visit the main page of Anna's Stays and click on the 'Find My Booking' tab or contact Anna directly.</p>
              </div>
            </div>
          )}

          {/* Contact Block */}
          <div className="border-t border-mist pt-8">
            <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans mb-6 text-center">Host Contact</p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cream flex items-center justify-center text-clay">
                  <Phone size={14} />
                </div>
                <span className="text-xs font-sans text-muted">+358 44 2400 228</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cream flex items-center justify-center text-clay">
                  <Mail size={14} />
                </div>
                <span className="text-xs font-sans text-muted">anna.humalainen@gmail.com</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-charcoal p-6 text-center">
          <p className="text-[0.6rem] tracking-[0.3em] uppercase text-birch font-sans">Anna's Stays · Helsinki</p>
        </div>
      </div>
      
      {!isPrintView && (
        <div className="text-center mt-8">
          <button 
            onClick={() => window.print()} 
            className="text-[0.65rem] tracking-widest uppercase text-muted hover:text-charcoal transition-colors font-sans border-b border-mist pb-1"
          >
            Print Itinerary
          </button>
        </div>
      )}
    </div>
  );
}
