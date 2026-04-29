mod app_data;
mod reveal;

pub mod desktop;
pub mod mobile;
pub mod traits;

pub use desktop::DesktopPlatform;
pub use mobile::MobilePlatform;
pub use traits::PlatformApi;
