import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/utils/supabase";

async function getProjects() {
  const { data, error } = await supabase.from("projects").select("*");

  if (error) {
    console.error("Error fetching projects:", error);
    return [];
  }

  return data;
}

export default async function Portfolio() {
  const projects = await getProjects();

  return (
    <div className="container mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-8">Our Portfolio</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-white shadow-md rounded-lg overflow-hidden"
          >
            <Image
              src={project.image_url || "/placeholder.svg"}
              alt={project.title}
              width={400}
              height={300}
              className="w-full"
            />
            <div className="p-4">
              <h2 className="text-xl font-semibold mb-2">{project.title}</h2>
              <p className="text-gray-600 mb-4">{project.description}</p>
              <Link
                href={`/portfolio/${project.id}`}
                className="text-blue-500 hover:underline"
              >
                View Project
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
