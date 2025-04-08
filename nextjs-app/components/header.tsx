import Link from "next/link";
import Image from "next/image";
import { siteConfig } from "@/config/site";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import Icon from "@/public/icon.svg";
import NearLogo from "@/public/images/near/near.svg";

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-black h-20 flex items-center">
      <Link href="/" className="flex items-center space-x-2 ml-2">
        <Image alt="Logo" src={Icon} width={48} height={24} priority={true} />
        <span className="inline-block font-bold text-white text-xl">
          {siteConfig.name}
        </span>
      </Link>
      <div className="grow" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Image
              className="rounded-full border-white border md:mr-3"
              alt="Near Logo"
              src={NearLogo}
              width={25}
              height={25}
            />
          </TooltipTrigger>
          <TooltipContent>
            <span>Coming Soon!</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="mr-2">
        <w3m-button />
      </div>
    </header>
  );
}
