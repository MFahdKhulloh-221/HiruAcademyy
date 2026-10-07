import Image from "next/image";
import { adminMediaUrl } from "@/lib/admin-media";
import { AdminVideoPreview } from "@/components/admin-media-upload";

type SenseiPreview = { name: string; role: string; bio: string; photo: string; photo_resolved_url?: string; expertise: readonly string[] };
type TestimonialPreview = { name: string; context: string; quote: string; image: string; image_resolved_url?: string; videoUrl: string; video_url_resolved_url?: string; videoTitle: string; landing: boolean };

export function AdminSenseiPreview({ profile, onPhotoError }: { profile: SenseiPreview; onPhotoError?: () => void }) {
  return <div className="admin-profile-preview sensei-page-list">
    <article className="sensei-card">
      <div className="sensei-avatar" aria-label={`Foto ${profile.name}`}>
        {profile.photo ? <Image src={adminMediaUrl(profile.photo, profile.photo_resolved_url)} alt={`Foto profil ${profile.name}`} fill sizes="270px" className="sensei-avatar-img" unoptimized onError={onPhotoError} /> : <span>{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className="sensei-card-body">
        <h3>{profile.name}</h3>
        <p>{profile.role}</p>
        <ul aria-label={`Fokus pembelajaran ${profile.name}`}>{profile.expertise.map((label) => <li key={label}>{label}</li>)}</ul>
        <div className="admin-sensei-preview-bio">{profile.bio}</div>
      </div>
    </article>
  </div>;
}

export function AdminTestimonialPreview({ testimonial, onImageError }: { testimonial: TestimonialPreview; onImageError?: () => void }) {
  return <div className={`admin-profile-preview admin-testimonial-preview${testimonial.landing ? " landing-testimonials" : ""}`}>
    <article className="testimonial-card">
      <div className="testimonial-avatar">
        {testimonial.image ? <Image src={adminMediaUrl(testimonial.image, testimonial.image_resolved_url)} alt={`Foto ${testimonial.name}`} fill sizes="64px" unoptimized onError={onImageError} /> : <span aria-hidden="true">{testimonial.name.slice(0, 2).toUpperCase()}</span>}
      </div>
      <blockquote>{testimonial.quote}</blockquote>
      <footer><strong>{testimonial.name}</strong><small>{testimonial.context}</small></footer>
    </article>
    {testimonial.videoUrl && <div className="testimonial-video-grid admin-testimonial-preview-video"><article>
      <AdminVideoPreview value={testimonial.videoUrl} resolved={testimonial.video_url_resolved_url} title={testimonial.videoTitle || `Video testimoni ${testimonial.name}`} />
      <footer><strong>{testimonial.videoTitle || testimonial.name}</strong><small>{testimonial.context}</small></footer>
    </article></div>}
  </div>;
}
